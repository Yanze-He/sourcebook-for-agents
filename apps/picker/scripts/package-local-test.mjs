import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const build = process.argv[2];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!/^build\.\d{3,}$/.test(build || "")) {
  throw new Error("Pass a candidate label such as: npm run package:local -- build.005");
}

run(["run", "build"]);
run(["exec", "wxt", "--", "zip"]);

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const generatedZip = resolve(root, ".output", `sourcebook-picker-${version}-chrome.zip`);
const destinationDirectory = resolve(root, "artifacts", "local-test");
const destination = resolve(destinationDirectory, `sourcebook-picker-v${version}-${build}.zip`);

if (!existsSync(generatedZip)) throw new Error(`Picker ZIP is missing: ${generatedZip}`);
mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(generatedZip, destination);
console.log(`Versioned Picker test ZIP: ${destination}`);

function run(args) {
  const result = spawnSync(npm, args, { cwd: root, env: process.env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
