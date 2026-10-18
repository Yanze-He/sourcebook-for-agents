import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stampAgentBundleVersion } from "../../agent-plugin/scripts/stamp-version.mjs";

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const serviceRoot = join(repositoryRoot, "apps", "service-go");
const mcpRoot = join(repositoryRoot, "apps", "mcp-go");
const agentPluginRoot = join(repositoryRoot, "apps", "agent-plugin");
const windowsHostRoot = join(desktopRoot, "windows-host");
const outputRoot = join(repositoryRoot, "release", "windows", "Sourcebook Desktop");
const appVersion = (process.env.SOURCEBOOK_VERSION || JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version).replace(/^v/, "");
const appBuild = process.env.SOURCEBOOK_BUILD?.trim() || "";
const shortcutIconSource = join(desktopRoot, "installer", "sourcebook-app-icon-256.png");

for (const path of [join(sourcesRoot, "dist", "index.html"), join(serviceRoot, "go.mod"), join(mcpRoot, "go.mod"), join(agentPluginRoot, "plugin.json"), join(windowsHostRoot, "go.mod"), shortcutIconSource]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(outputRoot, "resources"), { recursive: true });
cpSync(join(sourcesRoot, "dist"), join(outputRoot, "resources", "sources"), { recursive: true });
buildService(join(outputRoot, "sourcebook-service.exe"));
bundleAgentPlugin(join(outputRoot, "resources"));
writeWindowsIcon(shortcutIconSource, join(outputRoot, "SourcebookDesktop.ico"));
buildDesktopHost(join(outputRoot, "Sourcebook Desktop.exe"));
console.log(`Created ${outputRoot}`);

function buildService(destination) {
  console.log("Building the native Go service for Windows…");
  const linkerFlags = ["-s", "-w", `-X main.appVersion=${appVersion}`, ...(appBuild ? [`-X main.appBuild=${appBuild}`] : [])].join(" ");
  execFileSync("go", ["build", "-trimpath", `-ldflags=${linkerFlags}`, "-o", destination, "."], {
    cwd: serviceRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
}

function buildDesktopHost(destination) {
  console.log("Building the Windows taskbar host…");
  const linkerFlags = ["-s", "-w", "-H=windowsgui", `-X main.desktopVersion=${appVersion}`, ...(appBuild ? [`-X main.desktopArtifactBuild=${appBuild}`] : [])].join(" ");
  execFileSync("go", ["build", "-trimpath", `-ldflags=${linkerFlags}`, "-o", destination, "."], {
    cwd: windowsHostRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
}

function bundleAgentPlugin(resourcesRoot) {
  const marketplaceRoot = join(resourcesRoot, "agent-plugin");
  const pluginRoot = join(marketplaceRoot, ".agents", "plugins", "sourcebook");
  const binary = join(pluginRoot, "bin", "sourcebook-mcp.exe");
  mkdirSync(join(pluginRoot, "bin"), { recursive: true });
  cpSync(agentPluginRoot, pluginRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${join("scripts")}`) && !source.includes(`${join("bin")}`),
  });
  for (const guide of ["INSTALL-CODEX.md", "INSTALL-WORKBUDDY.md", "INSTALL-MCP.md"]) {
    copyFileSync(join(agentPluginRoot, guide), join(marketplaceRoot, guide));
  }
  const agentVersion = JSON.parse(readFileSync(join(agentPluginRoot, "plugin.json"), "utf8")).version;
  const bundleVersion = stampAgentBundleVersion(marketplaceRoot, agentVersion);
  const linkerFlags = ["-s", "-w", `-X main.bridgeVersion=${bundleVersion}`].join(" ");
  execFileSync("go", ["build", "-trimpath", `-ldflags=${linkerFlags}`, "-o", binary, "."], {
    cwd: mcpRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
  writeFileSync(join(pluginRoot, ".mcp.json"), `${JSON.stringify({ mcpServers: { sourcebook: { command: ".\\\\bin\\\\sourcebook-mcp.exe", args: [], cwd: ".", env: { SOURCEBOOK_AGENT_NAME: "Codex" } } } }, null, 2)}\n`);
  writeFileSync(join(pluginRoot, "mcp.json"), `${JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { sourcebook: { type: "stdio", command: "${PLUGIN_ROOT}/bin/sourcebook-mcp.exe", args: [] } } }, null, 2)}\n`);
  writeFileSync(join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), `${JSON.stringify({ name: "sourcebook-bundled", interface: { displayName: "Sourcebook Desktop" }, plugins: [{ name: "sourcebook", source: { source: "local", path: "./.agents/plugins/sourcebook" }, policy: { installation: "AVAILABLE" }, category: "Productivity" }] }, null, 2)}\n`);
}

function writeWindowsIcon(source, destination) {
  // Windows accepts PNG data in an ICO container. Keeping a 256px PNG avoids
  // resampling the mark in shortcuts while remaining compatible with Explorer.
  const png = readFileSync(source);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); entry.writeUInt8(0, 1); entry.writeUInt8(0, 2); entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6); entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
  writeFileSync(destination, Buffer.concat([header, entry, png]));
}
