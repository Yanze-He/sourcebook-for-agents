import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stampAgentBundleVersion } from "./stamp-version.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(pluginRoot));
const mcpRoot = join(repositoryRoot, "apps", "mcp-go");
const desktopRoot = join(repositoryRoot, "apps", "desktop");
const platform = process.env.SOURCEBOOK_AGENT_PLUGIN_PLATFORM || (process.platform === "win32" ? "windows-x64" : "macos-arm64");
const version = (process.env.SOURCEBOOK_AGENT_PLUGIN_VERSION || JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8")).version).replace(/^v/, "");
const build = process.env.SOURCEBOOK_BUILD?.trim() || "";
const outputRoot = process.env.SOURCEBOOK_AGENT_PLUGIN_OUTPUT_DIR ? resolve(process.env.SOURCEBOOK_AGENT_PLUGIN_OUTPUT_DIR) : join(repositoryRoot, "release", "agent-plugin");
const archiveName = `sourcebook-agent-plugin-${platform}-v${version}${build ? `-${build}` : ""}`;
const stagingRoot = join(outputRoot, archiveName);
const marketplaceRoot = join(stagingRoot, ".agents", "plugins");
const pluginDestination = join(marketplaceRoot, "sourcebook");
const isWindows = platform === "windows-x64";

if (!existsSync(join(mcpRoot, "go.mod"))) throw new Error("Sourcebook MCP source is missing.");
if (!["macos-arm64", "windows-x64"].includes(platform)) throw new Error(`Unsupported Sourcebook Agent Plugin platform: ${platform}`);

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(join(pluginDestination, "bin"), { recursive: true });
cpSync(pluginRoot, pluginDestination, { recursive: true, filter: (source) => !source.includes(`${join("scripts")}`) && !source.includes(`${join("bin")}`) });
cpSync(join(pluginRoot, "README.md"), join(stagingRoot, "README.md"));
for (const guide of ["INSTALL-CODEX.md", "INSTALL-WORKBUDDY.md", "INSTALL-MCP.md"]) {
  cpSync(join(pluginRoot, guide), join(stagingRoot, guide));
}

const bundleVersion = stampAgentBundleVersion(stagingRoot, version, build);

const binaryName = isWindows ? "sourcebook-mcp.exe" : "sourcebook-mcp";
const binaryPath = join(pluginDestination, "bin", binaryName);
const linkerFlags = ["-s", "-w", `-X main.bridgeVersion=${bundleVersion}`].join(" ");
console.log(`Building Sourcebook Agent Plugin for ${platform}…`);
execFileSync("go", ["build", "-trimpath", `-ldflags=${linkerFlags}`, "-o", binaryPath, "."], {
  cwd: mcpRoot,
  env: { ...process.env, GOOS: isWindows ? "windows" : "darwin", GOARCH: isWindows ? "amd64" : "arm64", CGO_ENABLED: "0" },
  stdio: "inherit",
});

const command = isWindows ? ".\\bin\\sourcebook-mcp.exe" : "./bin/sourcebook-mcp";
const mcpConfig = { mcpServers: { sourcebook: { command, args: [], cwd: ".", env: { SOURCEBOOK_AGENT_NAME: "Codex" } } } };
writeFileSync(join(pluginDestination, ".mcp.json"), `${JSON.stringify(mcpConfig, null, 2)}\n`);
writeFileSync(join(pluginDestination, "mcp.json"), `${JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { sourcebook: { type: "stdio", command: `${"${PLUGIN_ROOT}"}/bin/${binaryName}`, args: [] } } }, null, 2)}\n`);
writeFileSync(join(marketplaceRoot, "marketplace.json"), `${JSON.stringify({ name: "sourcebook-plugin", interface: { displayName: "Sourcebook" }, plugins: [{ name: "sourcebook", source: { source: "local", path: "./.agents/plugins/sourcebook" }, policy: { installation: "AVAILABLE" }, category: "Productivity" }] }, null, 2)}\n`);

const archivePath = join(outputRoot, `${archiveName}.zip`);
rmSync(archivePath, { force: true });
// bsdtar is available on both macOS and supported Windows runners. Unlike
// PowerShell Compress-Archive, it includes the hidden .agents plugin tree.
execFileSync("tar", ["-a", "-c", "-f", archivePath, basename(stagingRoot)], { cwd: outputRoot, env: { ...process.env, LC_ALL: "C" }, stdio: "inherit" });
const checksum = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
writeFileSync(`${archivePath}.sha256`, `${checksum}  ${basename(archivePath)}\n`);
console.log(`Created ${archivePath}`);
