import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { agentBundleVersion, stampAgentBundleVersion } from "./stamp-version.mjs";

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("stamps one build version into MCP guides, Skill, and bundle manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "sourcebook-agent-version-"));
  try {
    const pluginRoot = join(root, ".agents", "plugins", "sourcebook");
    cpSync(sourceRoot, pluginRoot, { recursive: true });
    for (const guide of ["INSTALL-CODEX.md", "INSTALL-WORKBUDDY.md", "INSTALL-MCP.md"]) {
      cpSync(join(sourceRoot, guide), join(root, guide));
    }
    const version = stampAgentBundleVersion(root, "0.1.1-beta.6", "build.010");
    assert.equal(version, "0.1.1-beta.6+build.010");
    const manifest = JSON.parse(readFileSync(join(root, "agent-version.json"), "utf8"));
    assert.equal(manifest.version, version);
    const plugin = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8"));
    assert.equal(plugin.version, "0.1.1-beta.6");
    const codexPlugin = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(codexPlugin.version, "0.1.1-beta.6");
    const skill = readFileSync(join(pluginRoot, "skills", "sourcebook", "SKILL.md"), "utf8");
    assert.match(skill, /sourcebook_version: "0\.1\.1-beta\.6\+build\.010"/);
    for (const guide of ["INSTALL-CODEX.md", "INSTALL-WORKBUDDY.md", "INSTALL-MCP.md"]) {
      assert.match(readFileSync(join(root, guide), "utf8"), /\*\*Version:\*\* 0\.1\.1-beta\.6\+build\.010/);
      assert.match(readFileSync(join(pluginRoot, guide), "utf8"), /\*\*Version:\*\* 0\.1\.1-beta\.6\+build\.010/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("version formatter rejects malformed build labels", () => {
  assert.equal(agentBundleVersion("v0.1.1", ""), "0.1.1");
  assert.throws(() => agentBundleVersion("0.1.1", "010"), /Invalid Agent bundle build/);
});
