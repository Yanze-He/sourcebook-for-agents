import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourcebookDataDirectory, sourcebookLibraryDirectory, sourcebookUrl } from "./paths.mjs";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = process.env.SOURCEBOOK_SOURCES_ROOT || join(repositoryRoot, "apps", "sources");
const serviceEntry = process.env.SOURCEBOOK_SERVICE_ENTRY || join(sourcesRoot, "server", "local-api.mjs");
const sourcesBuild = process.env.SOURCEBOOK_SOURCES_WEB_DIR || join(sourcesRoot, "dist");
const port = Number(process.env.SOURCEBOOK_PORT || 4177);
const url = sourcebookUrl(port);
const dataDirectory = sourcebookDataDirectory();
const libraryDirectory = sourcebookLibraryDirectory();

if (!existsSync(serviceEntry)) throw new Error(`Sourcebook service is missing: ${serviceEntry}`);
if (!existsSync(sourcesBuild)) throw new Error("Sourcebook Sources is not built. Run npm run build before starting the Desktop.");

mkdirSync(dataDirectory, { recursive: true });
const active = await healthCheck(url);
if (active.status === "incompatible") {
  throw new Error(`端口 ${port} 已被其他本地服务占用。请关闭该服务，或使用 SOURCEBOOK_PORT 指定另一个端口。`);
}
const child = active.status === "ready" ? null : spawn(process.execPath, [serviceEntry], {
  env: {
    ...process.env,
    API_PORT: String(port),
    SOURCEBOOK_DB_PATH: join(dataDirectory, "sourcebook.sqlite"),
    SOURCEBOOK_LIBRARY_DIR: libraryDirectory,
    SOURCEBOOK_LIBRARY_CONFIG: join(dataDirectory, "library-location.json"),
    SOURCEBOOK_EXPORT_DIR: join(dataDirectory, "exports"),
    SOURCEBOOK_SOURCES_WEB_DIR: sourcesBuild,
  },
  stdio: "inherit",
});

if (!child) console.log(`Sourcebook local service is already running at ${url}`);
if (child) await waitForHealth(url);
if (process.env.SOURCEBOOK_NO_OPEN !== "1") openBrowser(url);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(0);
  });
}

async function healthCheck(target) {
  try {
    const response = await fetch(new URL("/api/health", target));
    if (!response.ok) return { status: "unavailable" };
    const payload = await response.json();
    return payload?.app === "sourcebook-for-agents" ? { status: "ready" } : { status: "incompatible" };
  } catch {
    return { status: "unavailable" };
  }
}

async function waitForHealth(target) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await healthCheck(target)).status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child?.kill("SIGTERM");
  throw new Error("Sourcebook local service did not start");
}

function openBrowser(target) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  const browser = spawn(command, args, { detached: true, stdio: "ignore" });
  browser.unref();
}
