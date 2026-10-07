import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const outputRoot = join(repositoryRoot, "release", "windows", "Sourcebook Desktop");

for (const path of [join(sourcesRoot, "dist", "index.html"), join(sourcesRoot, "server", "local-api.mjs")]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(outputRoot, "resources"), { recursive: true });
copyFileSync(process.execPath, join(outputRoot, "node.exe"));
cpSync(join(desktopRoot, "src"), join(outputRoot, "resources", "desktop"), { recursive: true });
cpSync(join(sourcesRoot, "server"), join(outputRoot, "resources", "service"), { recursive: true });
cpSync(join(sourcesRoot, "dist"), join(outputRoot, "resources", "sources"), { recursive: true });
writeFileSync(join(outputRoot, "Sourcebook Desktop.cmd"), `@echo off
set ROOT=%~dp0resources
set SOURCEBOOK_SERVICE_ENTRY=%ROOT%\\service\\local-api.mjs
set SOURCEBOOK_SOURCES_WEB_DIR=%ROOT%\\sources
start "Sourcebook Desktop" /b "%~dp0node.exe" "%ROOT%\\desktop\\main.mjs"
`);
writeFileSync(join(outputRoot, "Sourcebook Desktop.vbs"), `Set shell = CreateObject("Wscript.Shell")
shell.Run Chr(34) & Replace(WScript.ScriptFullName, "Sourcebook Desktop.vbs", "Sourcebook Desktop.cmd") & Chr(34), 0
`);
console.log(`Created ${outputRoot}`);
