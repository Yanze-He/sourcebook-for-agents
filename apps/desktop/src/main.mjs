import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourcebookUrl } from "./paths.mjs";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = process.env.SOURCEBOOK_SOURCES_ROOT || join(repositoryRoot, "apps", "sources");
const serviceRoot = process.env.SOURCEBOOK_SERVICE_ROOT || join(repositoryRoot, "apps", "service-go");
const sourcesBuild = process.env.SOURCEBOOK_SOURCES_WEB_DIR || join(sourcesRoot, "dist");
const port = Number(process.env.SOURCEBOOK_PORT || 4177);
const url = sourcebookUrl(port);
const serviceBinary = process.env.SOURCEBOOK_SERVICE_BINARY || join(serviceRoot, ".dev", process.platform === "win32" ? "sourcebook-service.exe" : "sourcebook-service");

if (!existsSync(join(serviceRoot, "go.mod"))) throw new Error(`Sourcebook Go service is missing: ${serviceRoot}`);
if (!existsSync(sourcesBuild)) throw new Error("Sourcebook Sources is not built. Run npm run build before starting the Desktop.");

const active = await healthCheck(url);
if (active.status === "incompatible") {
  throw new Error(`端口 ${port} 已被其他本地服务占用。请关闭该服务，或使用 SOURCEBOOK_PORT 指定另一个端口。`);
}
if (active.status !== "ready" && !process.env.SOURCEBOOK_SERVICE_BINARY) buildService();
const child = active.status === "ready" ? null : spawn(serviceBinary, [], {
  env: {
    ...process.env,
    API_PORT: String(port),
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

function buildService() {
  mkdirSync(dirname(serviceBinary), { recursive: true });
  const result = spawnSync("go", ["build", "-trimpath", "-o", serviceBinary, "."], { cwd: serviceRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Sourcebook Go service could not be built.");
}
