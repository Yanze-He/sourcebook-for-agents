import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const serviceRoot = join(repositoryRoot, "apps", "service-go");
const windowsHostRoot = join(desktopRoot, "windows-host");
const outputRoot = join(repositoryRoot, "release", "windows", "Sourcebook Desktop");
const appVersion = (process.env.SOURCEBOOK_VERSION || JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version).replace(/^v/, "");
const shortcutIconSource = join(desktopRoot, "installer", "sourcebook-app-icon-256.png");

for (const path of [join(sourcesRoot, "dist", "index.html"), join(serviceRoot, "go.mod"), join(windowsHostRoot, "go.mod"), shortcutIconSource]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(outputRoot, "resources"), { recursive: true });
cpSync(join(sourcesRoot, "dist"), join(outputRoot, "resources", "sources"), { recursive: true });
buildService(join(outputRoot, "sourcebook-service.exe"));
writeWindowsIcon(shortcutIconSource, join(outputRoot, "SourcebookDesktop.ico"));
buildDesktopHost(join(outputRoot, "Sourcebook Desktop.exe"));
console.log(`Created ${outputRoot}`);

function buildService(destination) {
  console.log("Building the native Go service for Windows…");
  execFileSync("go", ["build", "-trimpath", `-ldflags=-s -w -X main.appVersion=${appVersion}`, "-o", destination, "."], {
    cwd: serviceRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
}

function buildDesktopHost(destination) {
  console.log("Building the Windows taskbar host…");
  execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w -H=windowsgui", "-o", destination, "."], {
    cwd: windowsHostRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
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
