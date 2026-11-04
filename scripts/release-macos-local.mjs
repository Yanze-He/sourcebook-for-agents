import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Local macOS releases must be created on macOS.");

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const identity = process.env.MACOS_SIGNING_IDENTITY?.trim();
const notaryProfile = process.env.SOURCEBOOK_NOTARY_PROFILE?.trim() || "sourcebook-notary";
const buildLabel = process.env.SOURCEBOOK_BUILD?.trim();
const candidateMetadata = process.env.SOURCEBOOK_CANDIDATE_METADATA?.trim();
const appVersion = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version.replace(/^v/, "");
const appPath = join(repositoryRoot, "release", "macos", "Sourcebook Desktop.app");
const dmgPath = join(repositoryRoot, "release", "macos", `sourcebook-desktop-installer-v${appVersion}.dmg`);

if (!identity) throw new Error("Set MACOS_SIGNING_IDENTITY to a Developer ID Application identity before releasing.");
if (!/^mac\.\d{3,}$/.test(buildLabel || "")) throw new Error("Set SOURCEBOOK_BUILD to the accepted macOS candidate label, for example mac.080.");
if (!candidateMetadata || !existsSync(candidateMetadata)) throw new Error("Set SOURCEBOOK_CANDIDATE_METADATA to the accepted local candidate build-info.json.");
assertCleanCheckout();
const candidate = assertCandidateMatchesRelease();
const candidateInstaller = join(dirname(candidateMetadata), candidate.installer);
if (!existsSync(candidateInstaller) || sha256(candidateInstaller) !== candidate.installerSha256) throw new Error("The tested local DMG is missing or its checksum changed.");
const candidateArchive = join(dirname(candidateMetadata), candidate.appArchive);
if (!existsSync(candidateArchive) || sha256(candidateArchive) !== candidate.appArchiveSha256) throw new Error("The accepted local app archive is missing or its checksum changed.");
const extractionRoot = mkdtempSync(join(tmpdir(), "sourcebook-release-app-"));
try {
  execFileSync("tar", ["-xzf", candidateArchive, "-C", extractionRoot], { stdio: "inherit" });
  run("npm", ["run", "package:macos"], { MACOS_SIGNING_IDENTITY: identity, SOURCEBOOK_PREBUILT_APP: join(extractionRoot, "Sourcebook Desktop.app") });
} finally {
  rmSync(extractionRoot, { recursive: true, force: true });
}
if (!existsSync(appPath) || !existsSync(dmgPath)) throw new Error("macOS package output is missing.");

run("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", notaryProfile, "--wait"]);
run("xcrun", ["stapler", "staple", dmgPath]);
run("xcrun", ["stapler", "validate", dmgPath]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", appPath]);
run(process.execPath, ["scripts/write-checksums.mjs", "release/macos"]);
const manifestPath = join(repositoryRoot, "release", "macos", "sourcebook-release-manifest.json");
writeFileSync(manifestPath, JSON.stringify({
  version: appVersion,
  platforms: { macos: { revision: buildLabel, asset: `sourcebook-desktop-installer-v${appVersion}.dmg`, sha256: sha256(dmgPath) } },
}, null, 2) + "\n");

console.log(`Signed and notarized release ready:\n${dmgPath}\n${join(repositoryRoot, "release", "macos", "SHA256SUMS.txt")}\n${manifestPath}`);

function assertCleanCheckout() {
  const changes = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (changes) throw new Error("Release from a clean checkout only. Commit or stash local changes first.");
}

function assertCandidateMatchesRelease() {
  const metadata = JSON.parse(readFileSync(candidateMetadata, "utf8"));
  const version = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version.replace(/^v/, "");
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (metadata.platform !== "macos") throw new Error("The candidate metadata is not for macOS.");
  if (metadata.version !== version) throw new Error(`Candidate version ${metadata.version} does not match release version ${version}.`);
  if (metadata.build !== buildLabel) throw new Error(`Candidate build ${metadata.build} does not match SOURCEBOOK_BUILD ${buildLabel}.`);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (metadata.tree !== tree || metadata.commit !== commit) throw new Error("The release source differs from the tested local candidate. Build and test a new candidate.");
  return metadata;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args, extraEnvironment = {}) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
}
