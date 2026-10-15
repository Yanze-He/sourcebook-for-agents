import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import appdmg from "appdmg";

const require = createRequire(import.meta.url);

if (process.platform !== "darwin") throw new Error("macOS packages must be built on macOS.");

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const sourcesRoot = join(repositoryRoot, "apps", "sources");
const serviceRoot = join(repositoryRoot, "apps", "service-go");
const appVersion = (process.env.SOURCEBOOK_VERSION || JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version).replace(/^v/, "");
const outputRoot = join(repositoryRoot, "release", "macos");
const appRoot = join(outputRoot, "Sourcebook Desktop.app");
const contents = join(appRoot, "Contents");
const resources = join(contents, "Resources");
const signingIdentity = process.env.MACOS_SIGNING_IDENTITY?.trim();
const appIconSource = join(desktopRoot, "installer", "sourcebook-app-icon.png");
const installerIconSource = join(desktopRoot, "installer", "sourcebook-installer-icon.png");
const menuBarHostSource = join(desktopRoot, "installer", "SourcebookMenuBar.m");
const fileIconSetterSource = join(desktopRoot, "installer", "SetFileIcon.m");

for (const path of [join(sourcesRoot, "dist", "index.html"), join(serviceRoot, "go.mod"), appIconSource, installerIconSource, menuBarHostSource, fileIconSetterSource]) {
  if (!existsSync(path)) throw new Error(`Missing package input: ${path}`);
}

mkdirSync(outputRoot, { recursive: true });
for (const output of [
  "Sourcebook Desktop.app",
  "dmg-staging",
  "Sourcebook Desktop.dmg",
  "Sourcebook-Desktop.dmg",
  "SourcebookDesktop.iconset",
  "SourcebookDesktop-icon-render",
  "SourcebookInstallerVolume.icns",
  "SourcebookInstallerVolume.iconset",
  "SourcebookInstallerVolume-icon-render",
  "set-sourcebook-file-icon",
]) {
  rmSync(join(outputRoot, output), { force: true, recursive: true });
}
mkdirSync(join(contents, "MacOS"), { recursive: true });
mkdirSync(resources, { recursive: true });

cpSync(join(sourcesRoot, "dist"), join(resources, "sources"), { recursive: true });
buildService(join(contents, "MacOS", "sourcebook-service"));
createIcon(appIconSource, join(resources, "SourcebookDesktop.icns"), "SourcebookDesktop");
const installerVolumeIcon = join(outputRoot, "SourcebookInstallerVolume.icns");
createIcon(installerIconSource, installerVolumeIcon, "SourcebookInstallerVolume");

createMenuBarHost(join(contents, "MacOS", "Sourcebook Desktop"));
writeFileSync(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Sourcebook Desktop</string>
  <key>CFBundleExecutable</key><string>Sourcebook Desktop</string>
  <key>CFBundleIdentifier</key><string>com.sourcebookforagents.desktop</string>
  <key>CFBundleName</key><string>Sourcebook Desktop</string>
  <key>CFBundleIconFile</key><string>SourcebookDesktop.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${appVersion}</string>
  <key>CFBundleVersion</key><string>${appVersion}</string>
  <key>NSAppleEventsUsageDescription</key><string>Sourcebook uses your browser only to return to an existing local Sourcebook page.</string>
</dict></plist>`);

if (signingIdentity) {
  execFileSync("codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", signingIdentity, appRoot], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appRoot], { stdio: "inherit" });
}

const dmgPath = join(outputRoot, "Sourcebook-Desktop.dmg");
await createDmg(installerVolumeIcon);
setDmgFileIcon(installerVolumeIcon, dmgPath);
signDmg();
rmSync(installerVolumeIcon, { force: true });
console.log(`Created ${dmgPath}`);

function buildService(destination) {
  console.log(`Building the native Go service for macOS ${process.arch}…`);
  execFileSync("go", ["build", "-trimpath", `-ldflags=-s -w -X main.appVersion=${appVersion}`, "-o", destination, "."], {
    cwd: serviceRoot,
    env: { ...process.env, GOOS: "darwin", GOARCH: process.arch === "x64" ? "amd64" : process.arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  });
  chmodSync(destination, 0o755);
}

function createIcon(source, destination, name) {
  const iconset = join(outputRoot, `${name}.iconset`);
  const renderedIconRoot = join(outputRoot, `${name}-icon-render`);
  mkdirSync(iconset, { recursive: true });
  mkdirSync(renderedIconRoot, { recursive: true });
  const renderedIcon = join(renderedIconRoot, `${name}.png`);
  if (source.endsWith(".png")) {
    copyFileSync(source, renderedIcon);
  } else {
    try {
      execFileSync("sips", ["-s", "format", "png", "-Z", "1024", source, "--out", renderedIcon], { stdio: "ignore" });
    } catch {
      execFileSync("qlmanage", ["-t", "-s", "1024", "-o", renderedIconRoot, source], { stdio: "ignore" });
      const quickLookIcon = join(renderedIconRoot, `${basename(source)}.png`);
      if (existsSync(quickLookIcon)) renameSync(quickLookIcon, renderedIcon);
    }
  }
  if (!existsSync(renderedIcon)) throw new Error("macOS could not render the application icon.");

  for (const [file, size] of [
    ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
  ]) {
    execFileSync("sips", ["-z", String(size), String(size), renderedIcon, "--out", join(iconset, file)], { stdio: "ignore" });
  }
  try {
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", destination], { stdio: "inherit" });
  } catch {
    // Some macOS 15 installations reject otherwise valid PNG iconsets. Encode
    // the same standard PNG representations directly so packaging remains
    // deterministic and the app still receives its branded Finder icon.
    const icns = require("icns-lib");
    const representations = {
      icp4: "icon_16x16.png",
      icp5: "icon_32x32.png",
      icp6: "icon_32x32@2x.png",
      ic07: "icon_128x128.png",
      ic08: "icon_256x256.png",
      ic09: "icon_512x512.png",
      ic10: "icon_512x512@2x.png"
    };
    const icons = Object.fromEntries(Object.entries(representations).map(([type, file]) => [type, readFileSync(join(iconset, file))]));
    writeFileSync(destination, icns.format(icons));
  }
  rmSync(iconset, { force: true, recursive: true });
  rmSync(renderedIconRoot, { force: true, recursive: true });
}

function createMenuBarHost(destination) {
  execFileSync("xcrun", ["clang", "-fobjc-arc", "-framework", "Cocoa", menuBarHostSource, "-o", destination], { stdio: "inherit" });
  chmodSync(destination, 0o755);
}

function signDmg() {
  if (!signingIdentity) return;
  execFileSync("codesign", ["--force", "--timestamp", "--sign", signingIdentity, dmgPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--verbose=2", dmgPath], { stdio: "inherit" });
}

function setDmgFileIcon(icon, target) {
  const setter = join(outputRoot, "set-sourcebook-file-icon");
  execFileSync("xcrun", ["clang", "-fobjc-arc", "-framework", "Cocoa", fileIconSetterSource, "-o", setter], { stdio: "inherit" });
  execFileSync(setter, [icon, target], { stdio: "inherit" });
  rmSync(setter, { force: true });
}

async function createDmg(installerVolumeIcon) {
  const generatedDmg = join(outputRoot, "Sourcebook Desktop.dmg");
  const stagingRoot = join(outputRoot, "dmg-staging");
  const stagingApp = join(stagingRoot, "Sourcebook Desktop.app");
  const background = join(desktopRoot, "node_modules", "create-dmg", "assets", "dmg-background.png");
  if (!existsSync(background)) throw new Error("Missing create-dmg background asset. Run npm install in apps/desktop before packaging.");
  mkdirSync(stagingRoot, { recursive: true });
  cpSync(appRoot, stagingApp, { recursive: true });
  console.log("Creating DMG…");
  await new Promise((resolve, reject) => {
    const builder = appdmg({
      target: generatedDmg,
      basepath: repositoryRoot,
      specification: {
        title: "Sourcebook Desktop",
        icon: installerVolumeIcon,
        background,
        "icon-size": 160,
        format: "ULFO",
        filesystem: "APFS",
        window: { size: { width: 660, height: 400 } },
        contents: [
          { x: 180, y: 170, type: "file", path: stagingApp },
          { x: 480, y: 170, type: "link", path: "/Applications" },
        ],
      },
    });
    builder.on("finish", resolve);
    builder.on("error", reject);
  });
  rmSync(stagingRoot, { force: true, recursive: true });
  if (!existsSync(generatedDmg)) throw new Error("create-dmg did not produce the expected DMG.");
  renameSync(generatedDmg, dmgPath);
}
