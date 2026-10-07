import { homedir, platform } from "node:os";
import { existsSync, readFileSync } from "node:fs";
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

export function sourcebookLibraryDirectory(env = process.env, currentPlatform = platform(), home = homedir()) {
  if (env.SOURCEBOOK_LIBRARY_DIR) return env.SOURCEBOOK_LIBRARY_DIR;
  const dataDirectory = sourcebookDataDirectory(env, currentPlatform, home);
  const locationFile = join(dataDirectory, "library-location.json");
  try {
    const configured = JSON.parse(readFileSync(locationFile, "utf8"));
    if (configured?.libraryRoot && existsSync(configured.libraryRoot)) return configured.libraryRoot;
  } catch { /* Use the default root until a completed migration is configured. */ }
  return join(dataDirectory, "Sourcebook Library");
}
