import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const result = spawnSync(npm, ["exec", "wxt", "--", "zip"], {
  cwd: root,
  env: { ...process.env, SOURCEBOOK_PICKER_STORE_BUILD: "1" },
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const generatedZip = resolve(root, ".output", `sourcebook-picker-${packageJson.version}-chrome.zip`);
const storeArtifactDirectory = resolve(root, "artifacts");
const storeZip = resolve(
  storeArtifactDirectory,
  `sourcebook-picker-${packageJson.version}-chrome-web-store.zip`
);
mkdirSync(storeArtifactDirectory, { recursive: true });
copyFileSync(generatedZip, storeZip);
console.log(`Chrome Web Store upload package: ${storeZip}`);
