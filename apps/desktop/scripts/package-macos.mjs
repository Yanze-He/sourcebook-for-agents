import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") throw new Error("macOS packages must be built on macOS.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const outputRoot = join(repositoryRoot, "release", "macos");
const appRoot = join(outputRoot, "Sourcebook Desktop.app");
const dmgRoot = join(outputRoot, "dmg-root");
const contents = join(appRoot, "Contents");
const resources = join(contents, "Resources");
const signingIdentity = process.env.MACOS_SIGNING_IDENTITY?.trim();

for (const path of [join(sourcesRoot, "dist", "index.html"), join(sourcesRoot, "server", "local-api.mjs")]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(join(contents, "MacOS"), { recursive: true });
mkdirSync(resources, { recursive: true });

copyFileSync(process.execPath, join(contents, "MacOS", "node"));
chmodSync(join(contents, "MacOS", "node"), 0o755);
cpSync(join(desktopRoot, "src"), join(resources, "desktop"), { recursive: true });
cpSync(join(sourcesRoot, "server"), join(resources, "service"), { recursive: true });
cpSync(join(sourcesRoot, "dist"), join(resources, "sources"), { recursive: true });

writeFileSync(join(contents, "MacOS", "Sourcebook Desktop"), `#!/bin/sh
ROOT="$(cd "$(dirname "$0")/../Resources" && pwd)"
export SOURCEBOOK_SERVICE_ENTRY="$ROOT/service/local-api.mjs"
export SOURCEBOOK_SOURCES_WEB_DIR="$ROOT/sources"
exec "$(dirname "$0")/node" "$ROOT/desktop/main.mjs" "$@"
`);
chmodSync(join(contents, "MacOS", "Sourcebook Desktop"), 0o755);
writeFileSync(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Sourcebook Desktop</string>
  <key>CFBundleExecutable</key><string>Sourcebook Desktop</string>
  <key>CFBundleIdentifier</key><string>com.sourcebookforagents.desktop</string>
  <key>CFBundleName</key><string>Sourcebook Desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSBackgroundOnly</key><true/>
</dict></plist>`);

if (signingIdentity) {
  execFileSync("codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", signingIdentity, appRoot], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appRoot], { stdio: "inherit" });
}

const dmgPath = join(outputRoot, "Sourcebook-Desktop.dmg");
mkdirSync(dmgRoot, { recursive: true });
cpSync(appRoot, join(dmgRoot, "Sourcebook Desktop.app"), { recursive: true });
symlinkSync("/Applications", join(dmgRoot, "Applications"));
writeFileSync(join(dmgRoot, "Install Sourcebook Desktop.txt"), `1. Drag “Sourcebook Desktop” onto the “Applications” shortcut.\n2. Eject this disk image.\n3. Open Sourcebook Desktop from Applications.\n`);
execFileSync("hdiutil", ["create", "-volname", "Sourcebook Desktop", "-srcfolder", dmgRoot, "-ov", "-format", "UDZO", dmgPath]);
rmSync(dmgRoot, { force: true, recursive: true });
console.log(`Created ${dmgPath}`);
