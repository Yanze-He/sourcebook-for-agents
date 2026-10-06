import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const companionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = join(dirname(companionRoot), "workspace");
const required = [
  join(workspaceRoot, "dist", "index.html"),
  join(workspaceRoot, "server", "local-api.mjs"),
  join(workspaceRoot, "server", "media.mjs"),
  join(companionRoot, "src", "main.mjs"),
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) throw new Error(`Companion build inputs are missing:\n${missing.join("\n")}`);
console.log("Sourcebook Companion build inputs are ready.");
