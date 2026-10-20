# Install or update Sourcebook Agent Plugin

This is the installation guide for a local Agent that receives a Sourcebook
install request. **Target Agent** is named in that request: Codex, WorkBuddy,
or a compatible stdio MCP Agent. Report only the final installed version and
the next action the user needs to take; do not dump review notes or logs.

Sourcebook Agent Plugin is versioned and distributed independently from
Sourcebook Desktop. Updating the Agent Plugin does not require a new Desktop
installer. An installed MCP-capable Desktop is still required to use Books;
an older Desktop build may need updating first.

## 1. Find the latest Agent Plugin release

Read the public GitHub Releases for
`https://github.com/Yanze-He/sourcebook-for-agents`. Select the highest
semantic-version **non-draft** tag beginning `agent-v`; never use a Desktop
`v…` release, a draft, or an unverified third-party mirror. If no `agent-v`
release exists yet, stop: say the independent Agent Plugin is not published
yet. Do not claim installation succeeded or install an arbitrary branch.

Choose the asset matching this computer:

- macOS Apple silicon: `sourcebook-agent-plugin-macos-arm64-v<VERSION>.zip`
- Windows x64: `sourcebook-agent-plugin-windows-x64-v<VERSION>.zip`

Unsupported systems: stop and say there is no matching package. Download the
matching archive and its `.zip.sha256` file from that **same** Release. Compare the
archive's SHA-256 digest before extracting. On macOS, only use a published
package that has completed code signing and notarization. If download,
checksum, signature, or extraction fails, stop without changing an existing
installation.

## 2. Check Desktop before changing the Agent

Extract the archive to a fresh temporary directory. Its top-level directory
contains `.agents/plugins/sourcebook/bin/sourcebook-mcp` (or `.exe` on
Windows), `agent-version.json`, and the three `INSTALL-*.md` guides. Run that
helper's `check-desktop` command **before** modifying any Agent configuration.
It checks for a verified Sourcebook Desktop installation, including one on
another disk. If Desktop is missing, stop and tell the user:

> Sourcebook Desktop is not installed. Download it from
> https://sourcebook.online, install and open it, then retry.

Do not mistake an offline Desktop for an absent installation. The helper may
recognize an installed Desktop even when it is not running. Older Desktop
builds without an installation marker can be recognized while their local
service is running, but only when that service exposes the Agent connection
endpoint. If the helper says Desktop needs an update, ask the user to install
the current Desktop from https://sourcebook.online and retry.

## 3. Install or update the independent plugin

Read `agent-version.json` from the verified archive and compare it with the
currently installed Agent Plugin, if any. Use this independent Agent version,
not the Desktop version. Install to a stable user-level directory named
`agent-plugin-installed` **beside**, not inside, Desktop's `agent-plugin`
fallback directory:

- macOS: `~/Library/Application Support/Sourcebook for Agents/agent-plugin-installed`
- Windows: `%APPDATA%\Sourcebook for Agents\agent-plugin-installed`

The Desktop fallback directory is refreshed on app launch; never put an
independently updated plugin there. Stage the verified archive in the same
parent folder, then replace only an existing Sourcebook
`agent-plugin-installed` directory. Keep the previous version recoverable
until installation and verification succeed. Never delete another Agent's
configuration or overwrite a non-Sourcebook directory.

If this Agent session cannot write to the user-level installation or Agent
configuration directory, **stop**. State that this session lacks permission
and ask the user to run the same installation from a local Agent task with
the necessary access, or use a local Terminal. A downloaded archive alone is
not an installed plugin. Do not try to route around the host's permission
boundary or report success after a denied write.

Then follow the `INSTALL-CODEX.md`, `INSTALL-WORKBUDDY.md`, or
`INSTALL-MCP.md` in the **installed** directory. Those guides only configure
the selected Agent. They do not grant Agent access to Books; the user must
also allow local Agent access in Sourcebook Desktop.

For Codex, run the installed `sourcebook-mcp install-codex`. For WorkBuddy,
merge only `mcpServers.sourcebook` into its user-level MCP configuration and
copy only the Sourcebook Skill. For other Agents, register the installed
binary as a user-level stdio MCP server named `sourcebook` according to that
Agent's own configuration format.

Finally verify the configured MCP binary's `version` output and, where a
Skill was installed, `metadata.sourcebook_version` both match
`agent-version.json`. If verification fails, restore the previous Sourcebook
installation and report what remains. On success, state the version and ask
the user to restart the target Agent or start a new conversation.
