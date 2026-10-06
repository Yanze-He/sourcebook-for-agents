import { homedir, platform } from "node:os";
import { join } from "node:path";

export function sourcebookDataDirectory(env = process.env, currentPlatform = platform(), home = homedir()) {
  if (env.SOURCEBOOK_DATA_DIR) return env.SOURCEBOOK_DATA_DIR;
  if (currentPlatform === "darwin") return join(home, "Library", "Application Support", "Sourcebook for Agents");
  if (currentPlatform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "Sourcebook for Agents");
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "sourcebook-for-agents");
}

export function sourcebookUrl(port) {
  return `http://127.0.0.1:${port}/`;
}
