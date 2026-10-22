import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const repositoryRoot = process.cwd();
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));
const platform = options.platform;
const installer = options.installer;
const app = options.app;
const build = process.env.SOURCEBOOK_BUILD?.trim();
const version = (process.env.SOURCEBOOK_VERSION || JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version).replace(/^v/, "");
const agentPluginVersion = JSON.parse(readFileSync(join(repositoryRoot, "apps", "agent-plugin", "plugin.json"), "utf8")).version;

if (!["macos", "windows"].includes(platform)) throw new Error("Pass --platform macos or --platform windows.");
if (!installer || !existsSync(installer)) throw new Error("Pass an existing --installer path.");
if (!/^build\.\d{3,}$/.test(build || "")) throw new Error("SOURCEBOOK_BUILD must be a label such as build.003.");
if (platform === "macos" && (!app || !existsSync(app))) throw new Error("macOS candidates require an existing --app path.");

const outputRoot = join(dirname(installer), "candidate");
const extension = platform === "macos" ? "dmg" : "exe";
const installerName = `sourcebook-desktop-${platform}-v${version}-${build}.${extension}`;
mkdirSync(outputRoot, { recursive: true });
copyFileSync(installer, join(outputRoot, installerName));

const metadata = {
  platform,
  version,
  agentPluginVersion,
  build,
  commit: git("rev-parse", "HEAD"),
  tree: git("rev-parse", "HEAD^{tree}"),
  installer: installerName,
};
if (platform === "macos") {
  const appArchive = `sourcebook-desktop-macos-v${version}-${build}-unsigned-app.tar.gz`;
  execFileSync("tar", ["-czf", join(outputRoot, appArchive), "-C", dirname(app), basename(app)], { stdio: "inherit" });
  metadata.appArchive = appArchive;
}
writeFileSync(join(outputRoot, "build-info.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log(`Prepared ${platform} candidate artifact in ${outputRoot}`);

function git(...args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

