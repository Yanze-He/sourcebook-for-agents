import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Local macOS releases must be created on macOS.");

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const identity = process.env.MACOS_SIGNING_IDENTITY?.trim();
const notaryProfile = process.env.SOURCEBOOK_NOTARY_PROFILE?.trim() || "sourcebook-notary";
const appPath = join(repositoryRoot, "release", "macos", "Sourcebook Desktop.app");
const dmgPath = join(repositoryRoot, "release", "macos", "Sourcebook-Desktop.dmg");

if (!identity) throw new Error("Set MACOS_SIGNING_IDENTITY to a Developer ID Application identity before releasing.");
assertCleanTaggedCheckout();

run("npm", ["run", "package:macos"], { MACOS_SIGNING_IDENTITY: identity });
if (!existsSync(appPath) || !existsSync(dmgPath)) throw new Error("macOS package output is missing.");

run("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", notaryProfile, "--wait"]);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", appPath]);
run(process.execPath, ["scripts/write-checksums.mjs", "release/macos"]);

console.log(`Signed and notarized release ready:\n${dmgPath}\n${join(repositoryRoot, "release", "macos", "SHA256SUMS.txt")}`);

function assertCleanTaggedCheckout() {
  const changes = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (changes) throw new Error("Release from a clean checkout only. Commit or stash local changes first.");
  try {
    execFileSync("git", ["describe", "--tags", "--exact-match", "HEAD"], { cwd: repositoryRoot, stdio: "ignore" });
  } catch {
    throw new Error("Release from an exact version tag only.");
  }
}

function run(command, args, extraEnvironment = {}) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
}
