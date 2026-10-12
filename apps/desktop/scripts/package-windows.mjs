import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const serviceRoot = join(repositoryRoot, "apps", "service-go");
const outputRoot = join(repositoryRoot, "release", "windows", "Sourcebook Desktop");

for (const path of [join(sourcesRoot, "dist", "index.html"), join(serviceRoot, "go.mod")]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(outputRoot, "resources"), { recursive: true });
cpSync(join(sourcesRoot, "dist"), join(outputRoot, "resources", "sources"), { recursive: true });
buildService(join(outputRoot, "sourcebook-service.exe"));
writeFileSync(join(outputRoot, "Sourcebook Desktop.cmd"), `@echo off
set ROOT=%~dp0resources
set SOURCEBOOK_SOURCES_WEB_DIR=%ROOT%\\sources
start "Sourcebook Desktop" /b "%~dp0sourcebook-service.exe"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4177/"
`);
writeFileSync(join(outputRoot, "Sourcebook Desktop.vbs"), `Set shell = CreateObject("Wscript.Shell")
shell.Run Chr(34) & Replace(WScript.ScriptFullName, "Sourcebook Desktop.vbs", "Sourcebook Desktop.cmd") & Chr(34), 0
`);
console.log(`Created ${outputRoot}`);

function buildService(destination) {
  console.log("Building the native Go service for Windows…");
  execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", destination, "."], {
    cwd: serviceRoot,
    env: { ...process.env, GOOS: "windows", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
}
