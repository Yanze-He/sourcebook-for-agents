import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function agentBundleVersion(version, build = "") {
  const normalizedVersion = version.replace(/^v/, "").trim();
  const normalizedBuild = build.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    throw new Error(`Invalid Agent bundle version: ${version}`);
  }
  if (normalizedBuild && !/^build\.\d{3,}$/.test(normalizedBuild)) {
    throw new Error(`Invalid Agent bundle build: ${build}`);
  }
  return normalizedVersion + (normalizedBuild ? `+${normalizedBuild}` : "");
}

export function stampAgentBundleVersion(marketplaceRoot, version, build = "") {
  const value = agentBundleVersion(version, build);
  const pluginRoot = join(marketplaceRoot, ".agents", "plugins", "sourcebook");
  const pluginManifestPath = join(pluginRoot, "plugin.json");
  const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  pluginManifest.version = value.split("+")[0];
  writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`);
  const codexManifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  const codexManifest = JSON.parse(readFileSync(codexManifestPath, "utf8"));
  codexManifest.version = value.split("+")[0];
  writeFileSync(codexManifestPath, `${JSON.stringify(codexManifest, null, 2)}\n`);
  const skillPath = join(pluginRoot, "skills", "sourcebook", "SKILL.md");
  const skill = readFileSync(skillPath, "utf8");
  if (!/^  sourcebook_version: "[^"]+"$/m.test(skill)) {
    throw new Error("The bundled Sourcebook Skill has no version metadata.");
  }
  writeFileSync(skillPath, skill.replace(/^  sourcebook_version: "[^"]+"$/m, `  sourcebook_version: "${value}"`));
  for (const guide of ["INSTALL-CODEX.md", "INSTALL-WORKBUDDY.md", "INSTALL-MCP.md"]) {
    for (const path of [join(marketplaceRoot, guide), join(pluginRoot, guide)]) {
      const content = readFileSync(path, "utf8");
      if (!/^\*\*Version:\*\* \S+$/m.test(content)) {
        throw new Error(`${path} has no version marker.`);
      }
      writeFileSync(path, content.replace(/^\*\*Version:\*\* \S+$/m, `**Version:** ${value}`));
    }
  }
  writeFileSync(join(marketplaceRoot, "agent-version.json"), `${JSON.stringify({ version: value }, null, 2)}\n`);
  return value;
}
