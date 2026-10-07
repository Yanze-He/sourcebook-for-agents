import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

for (const directory of [".", "apps/picker", "apps/sources"]) {
  const result = spawnSync("npm", ["ci"], { cwd: `${root}/${directory}`, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
