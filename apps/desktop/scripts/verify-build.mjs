import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcesRoot = join(dirname(desktopRoot), "sources");
const serviceRoot = join(dirname(desktopRoot), "service-go");
const required = [
  join(sourcesRoot, "dist", "index.html"),
  join(serviceRoot, "go.mod"),
  join(serviceRoot, "main.go"),
  join(desktopRoot, "src", "main.mjs"),
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) throw new Error(`Desktop build inputs are missing:\n${missing.join("\n")}`);
console.log("Sourcebook Desktop build inputs are ready.");
