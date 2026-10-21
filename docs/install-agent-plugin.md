# Install or update Sourcebook for an Agent

Use this guide when a user shares the **Connect an Agent** installation prompt
from Sourcebook Desktop. It contains the steps needed for the normal install;
it is self-contained and should be the only installation document the Agent
needs. Keep the reply practical and short.

## Before you start

Sourcebook Agent Plugin connects to the user's local Sourcebook Desktop library.
Desktop must be installed, running, and have **Settings → Connect an Agent →
Local access** enabled. If Desktop is not installed, direct the user to
[sourcebook.online](https://sourcebook.online) first.

Identify which Agent and execution environment the user is using. Do not run
host commands from a cloud or remote session as if they affected the user's
computer.

## Codex on the user's computer

Installation changes the Codex configuration on the computer running the
command. Run these commands only from a local Codex task with permission or
from that computer's Terminal:

```sh
codex plugin marketplace add Yanze-He/sourcebook-plugin
codex plugin add sourcebook@sourcebook-plugin
```

If `sourcebook-plugin` is already registered, upgrade it before adding the
plugin again:

```sh
codex plugin marketplace upgrade sourcebook-plugin
codex plugin add sourcebook@sourcebook-plugin
```

Then restart Codex, start a **new local task**, and ask it to **“Open
Sourcebook.”** Confirm the Sourcebook MCP tools are available and the helper
reports its version before saying installation succeeded. If Codex reports a
permission error, the Agent has not installed it: tell the user to run the
commands in their own Terminal.

If this is a cloud-hosted or remote Codex task, stop without running commands
or searching its filesystem. Tell the user: **“This task cannot install a
plugin on your computer. Please open a local Codex task and paste the same
installation request there, or run the commands above in your computer's
Terminal.”**

## WorkBuddy

WorkBuddy installation must be completed by the user in its interface. Give
the user the steps below and stop. If the current chat cannot operate
WorkBuddy's marketplace UI, do not try to compensate with local file or shell
access.

Never inspect `~/.workbuddy` or search the user's computer for plugin files.
Do not download a release ZIP, install or copy plugin files, run the MCP binary,
edit `mcp.json` or WorkBuddy's plugin registries, change Trust settings, or
write installation reports or memory files. Do not switch to a manual MCP
fallback, even if marketplace tools are unavailable or an older installation
is detected. If the user asks you to perform installation, explain in one
sentence that they need to complete these UI steps themselves:

1. In **Skills → Suites → Add marketplace**, add `Yanze-He/sourcebook-plugin`.
2. Install or update **sourcebook** from that marketplace.
3. In **Connectors → Custom connectors → MCP service management**, click
   **Trust** for Sourcebook if prompted.
4. Restart WorkBuddy, start a new conversation, and ask **“Open Sourcebook.”**

If WorkBuddy reports **“Plugin sourcebook is not found in marketplace
sourcebook-plugin”**, tell the user to remove the broken Sourcebook marketplace
entry, add `Yanze-He/sourcebook-plugin` again through **Add marketplace**, and
then install Sourcebook. Removing an entry may also remove its installed
plugins; warn the user before they do this. Do not suggest adding an unpacked
ZIP or temporary folder as a marketplace.

After the user completes the UI steps, they must restart WorkBuddy and start a
new conversation. Treat installation as unconfirmed until Sourcebook tools are
visible in that new conversation. If an old manual connection appears to
override the marketplace install, do not inspect or change WorkBuddy's files;
state the symptom and ask the user to follow WorkBuddy's documented connector
management steps.

## Other Agents

The same Sourcebook MCP server and Skill may be adaptable, but marketplace
packages and installation steps are Agent-specific. First check the Agent's
official documentation for both Skill installation and a local stdio MCP
server on the same computer as Sourcebook Desktop. If both are documented,
give a short proposed adaptation and clearly say it is unverified and may not
work. Never copy Codex or WorkBuddy steps, edit undocumented internal files, or
claim support without verification. If there is no documented compatible path,
say briefly: **“Sourcebook does not support this Agent yet; support may be
considered later.”**

## What to tell the user

- **Codex success:** Only after the MCP tools are visible and the helper version
  is confirmed, say installation succeeded, include that version, and ask the
  user to start a new local task and try **“Open Sourcebook.”**
- **WorkBuddy:** Give the four UI steps above. Say the user needs to complete
  them and that installation is not confirmed until Sourcebook tools appear.
- **Blocked:** State the specific blocker and one next action. Do not provide a
  long analysis, command transcript, or claim that an attempted install
  succeeded.
