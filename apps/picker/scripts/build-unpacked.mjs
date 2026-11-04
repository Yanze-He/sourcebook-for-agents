import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wxt = resolve(root, "node_modules", "wxt", "bin", "wxt.mjs");
const rawOutput = resolve(root, ".output", "chrome-mv3");
const unpackedOutput = resolve(root, "artifacts", "unpacked");

const result = spawnSync(process.execPath, [wxt, "build"], {
  cwd: root,
  env: process.env,
  stdio: "inherit"
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(rawOutput)) throw new Error(`Picker build output is missing: ${rawOutput}`);

// The browser loads this stable directory once. Replace its contents after a
// successful build, while preserving the directory's path for Chrome Reload.
rmSync(unpackedOutput, { recursive: true, force: true });
mkdirSync(unpackedOutput, { recursive: true });
cpSync(rawOutput, unpackedOutput, { recursive: true, force: true });
console.log(`Unpacked Picker ready for browser Reload: ${unpackedOutput}`);
