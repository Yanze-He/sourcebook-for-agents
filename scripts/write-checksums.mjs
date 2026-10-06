import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: node scripts/write-checksums.mjs <release-directory>");
const files = listFiles(root).filter((path) => !path.endsWith("SHA256SUMS.txt"));
const lines = files.map((path) => `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${relative(root, path)}`);
writeFileSync(join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : statSync(path).isFile() ? [path] : [];
  });
}
