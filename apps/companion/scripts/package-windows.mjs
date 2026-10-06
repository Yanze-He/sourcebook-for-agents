import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows.");

const companionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(companionRoot));
const workspaceRoot = join(repositoryRoot, "apps", "workspace");
const outputRoot = join(repositoryRoot, "release", "windows", "Sourcebook Companion");

for (const path of [join(workspaceRoot, "dist", "index.html"), join(workspaceRoot, "server", "local-api.mjs")]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(outputRoot, "resources"), { recursive: true });
copyFileSync(process.execPath, join(outputRoot, "node.exe"));
cpSync(join(companionRoot, "src"), join(outputRoot, "resources", "companion"), { recursive: true });
cpSync(join(workspaceRoot, "server"), join(outputRoot, "resources", "service"), { recursive: true });
cpSync(join(workspaceRoot, "dist"), join(outputRoot, "resources", "workspace"), { recursive: true });
writeFileSync(join(outputRoot, "Sourcebook Companion.cmd"), `@echo off
set ROOT=%~dp0resources
set SOURCEBOOK_SERVICE_ENTRY=%ROOT%\\service\\local-api.mjs
set SOURCEBOOK_WEB_DIR=%ROOT%\\workspace
start "Sourcebook Companion" /b "%~dp0node.exe" "%ROOT%\\companion\\main.mjs"
`);
writeFileSync(join(outputRoot, "Sourcebook Companion.vbs"), `Set shell = CreateObject("Wscript.Shell")
shell.Run Chr(34) & Replace(WScript.ScriptFullName, "Sourcebook Companion.vbs", "Sourcebook Companion.cmd") & Chr(34), 0
`);
console.log(`Created ${outputRoot}`);
