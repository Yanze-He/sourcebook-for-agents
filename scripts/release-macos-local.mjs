import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Local macOS releases must be created on macOS.");

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const identity = process.env.MACOS_SIGNING_IDENTITY?.trim();
const notaryProfile = process.env.SOURCEBOOK_NOTARY_PROFILE?.trim() || "sourcebook-notary";
const buildLabel = process.env.SOURCEBOOK_BUILD?.trim();
const prebuiltApp = process.env.SOURCEBOOK_PREBUILT_APP?.trim();
const candidateMetadata = process.env.SOURCEBOOK_CANDIDATE_METADATA?.trim();
const appVersion = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version.replace(/^v/, "");
const appPath = join(repositoryRoot, "release", "macos", "Sourcebook Desktop.app");
const dmgPath = join(repositoryRoot, "release", "macos", `sourcebook-desktop-installer-v${appVersion}.dmg`);

if (!identity) throw new Error("Set MACOS_SIGNING_IDENTITY to a Developer ID Application identity before releasing.");
if (!/^build\.\d{3,}$/.test(buildLabel || "")) throw new Error("Set SOURCEBOOK_BUILD to the approved build label, for example build.003.");
if (!prebuiltApp || !candidateMetadata) throw new Error("Set SOURCEBOOK_PREBUILT_APP and SOURCEBOOK_CANDIDATE_METADATA from the accepted GitHub candidate artifact.");
if (!existsSync(prebuiltApp) || !existsSync(candidateMetadata)) throw new Error("The accepted GitHub candidate app or metadata file is missing.");
assertCleanTaggedCheckout();
assertCandidateMatchesRelease();

run("npm", ["run", "package:macos"], { MACOS_SIGNING_IDENTITY: identity, SOURCEBOOK_PREBUILT_APP: prebuiltApp });
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

function assertCandidateMatchesRelease() {
  const metadata = JSON.parse(readFileSync(candidateMetadata, "utf8"));
  const version = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version.replace(/^v/, "");
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (metadata.platform !== "macos") throw new Error("The candidate metadata is not for macOS.");
  if (metadata.version !== version) throw new Error(`Candidate version ${metadata.version} does not match release version ${version}.`);
  if (metadata.build !== buildLabel) throw new Error(`Candidate build ${metadata.build} does not match SOURCEBOOK_BUILD ${buildLabel}.`);
  if (metadata.tree !== tree) throw new Error("The tagged release source tree differs from the tested GitHub candidate. Build and test a new candidate.");
}

function run(command, args, extraEnvironment = {}) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
}
