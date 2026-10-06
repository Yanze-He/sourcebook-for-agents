import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") throw new Error("macOS packages must be built on macOS.");

const companionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(companionRoot));
const workspaceRoot = join(repositoryRoot, "apps", "workspace");
const outputRoot = join(repositoryRoot, "release", "macos");
const appRoot = join(outputRoot, "Sourcebook Companion.app");
const contents = join(appRoot, "Contents");
const resources = join(contents, "Resources");

for (const path of [join(workspaceRoot, "dist", "index.html"), join(workspaceRoot, "server", "local-api.mjs")]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(contents, "MacOS"), { recursive: true });
mkdirSync(resources, { recursive: true });

copyFileSync(process.execPath, join(contents, "MacOS", "node"));
chmodSync(join(contents, "MacOS", "node"), 0o755);
cpSync(join(companionRoot, "src"), join(resources, "companion"), { recursive: true });
cpSync(join(workspaceRoot, "server"), join(resources, "service"), { recursive: true });
cpSync(join(workspaceRoot, "dist"), join(resources, "workspace"), { recursive: true });

writeFileSync(join(contents, "MacOS", "Sourcebook Companion"), `#!/bin/sh
ROOT="$(cd "$(dirname "$0")/../Resources" && pwd)"
export SOURCEBOOK_SERVICE_ENTRY="$ROOT/service/local-api.mjs"
export SOURCEBOOK_WEB_DIR="$ROOT/workspace"
exec "$(dirname "$0")/node" "$ROOT/companion/main.mjs" "$@"
`);
chmodSync(join(contents, "MacOS", "Sourcebook Companion"), 0o755);
writeFileSync(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Sourcebook Companion</string>
  <key>CFBundleExecutable</key><string>Sourcebook Companion</string>
  <key>CFBundleIdentifier</key><string>com.sourcebookforagents.companion</string>
  <key>CFBundleName</key><string>Sourcebook Companion</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSBackgroundOnly</key><true/>
</dict></plist>`);

const dmgPath = join(outputRoot, "Sourcebook-Companion.dmg");
execFileSync("hdiutil", ["create", "-volname", "Sourcebook Companion", "-srcfolder", appRoot, "-ov", "-format", "UDZO", dmgPath]);
console.log(`Created ${dmgPath}`);
