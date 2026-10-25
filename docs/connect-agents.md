# Connect Sourcebook to an Agent

Sourcebook Desktop and the Agent Plugin are independent installations. Desktop provides Books and local access controls; the Plugin supplies the MCP helper and Skill. Updating either one never replaces the other.

In **Settings → Connect an Agent**, allow local-agent access, choose an Agent, then copy the short installation request into a conversation with that Agent. The request points to the [GitHub install/update guide](install-agent-plugin.md). The Agent downloads and verifies the latest independent `agent-v…` Release, checks that Desktop is installed, then updates only Sourcebook's own Agent integration. If Desktop is absent, it should direct the user to [sourcebook.online](https://sourcebook.online) and stop. The prompt never contains a pairing credential.

The connection window's help popover shows the fallback Agent version **included with Desktop**, not the latest GitHub version or a claim about what Codex or WorkBuddy has installed. The target Agent reports the verified independent Plugin version after installation.

After setup, use natural language: for example, “Open my Sourcebook and let me choose a Book first” or “Save this decision to my Product Book.” `@Sourcebook` and `/` can be host conveniences, but they are not required.

## Codex

Choose **Codex** and send the copied request to a local Codex task. Codex installs or updates `sourcebook@sourcebook-plugin` from Sourcebook's independent Git marketplace. If an old Desktop-owned Plugin is present, the update removes that retired registration before adding the independent Plugin. If the task sandbox blocks writes to Codex's user-level plugin cache, it must stop and tell you to use a local Codex task with access or run the documented commands in Terminal. A permission error is not a completed installation.

Plugin installation does not require the current installation task to reach Sourcebook's loopback service. This matters because some Agent sandboxes block `127.0.0.1`. Start a new local Codex task after installation; that task connects to Desktop only when you use Sourcebook.

Start a new local Codex task after it succeeds. The Plugin supplies the Sourcebook MCP and Skill together; the Skill helps recognize ordinary requests to search, save, organize, or wrap up work in a Book.

## WorkBuddy

Choose **WorkBuddy** and send the copied request to WorkBuddy. It downloads the matching Agent Plugin Release, checks Desktop, reads its `INSTALL-WORKBUDDY.md`, and completes the user-level setup:

1. It checks the independently installed Skill, then backs up and merges `~/.workbuddy/mcp.json`, changing only `mcpServers.sourcebook` and preserving other MCP settings.
2. It installs or updates the same Sourcebook Skill at `~/.workbuddy/skills/sourcebook/`. If that folder belongs to something other than an existing Sourcebook Skill, it stops and asks you what to do.
3. It verifies the copied Skill version against the independent MCP version, then reports that version on success or the specific action you need to take. After success, restart WorkBuddy and begin a new conversation.

WorkBuddy does not silently overwrite a malformed configuration, a conflicting Sourcebook entry, another MCP server, or another Skill.

## Connect any compatible MCP Agent

1. Install and start Sourcebook Desktop.
2. In **Settings → Connect an Agent**, choose **Allow local-agent access**.
3. Select **Any compatible MCP Agent** and copy the generated request. The Agent reads the GitHub installation guide and the downloaded `INSTALL-MCP.md`.
4. Add the independently installed helper as a user-level **stdio** MCP server named `sourcebook`, using the target Agent's configuration format. Do not add it to a project repository.

The helper reads its local pairing state only when it starts. A pairing credential is never placed in an Agent configuration, prompt, or plugin archive.

After connecting, simply say something like: **“Open my Sourcebook and let me choose a Book first”** or **“Save this decision to my Product Book.”** The model receives Sourcebook’s workflow instructions and can call the `sourcebook` tools itself. You do not need `@` or `/`; a current or named project Book is also a natural cue. If “book” could mean an ordinary book or another product, the Agent should ask rather than assume.

Before its first Sourcebook action, the Plugin checks the local connection and tries to start an installed Desktop app. Its returned URL confirms that Desktop is available, but does **not** prove a panel opened. An MCP Apps host may render the library in its own panel. If no panel appears, the Agent should open the returned URL in its built-in browser panel when available, including WorkBuddy; otherwise it should give you the URL to open. After submitting content for review, the Agent should bring Sourcebook into view again so you can accept or reject it. If Desktop cannot be started, it tells you to open or reinstall it; if local access is off, it tells you to open **Settings → Connect an Agent → Allow local-agent access**. If only the Plugin is too old, it updates the Plugin and asks you to start a new local task. If Desktop is too old, it tells you which app to update and never replaces Desktop itself.

This works with Claude Code, Grokbot, Cursor, VS Code/Copilot, Gemini CLI, Windsurf, and other Agents that support local stdio MCP. A host may additionally surface an MCP Prompt as a slash command, but its exact syntax is host-specific and optional.

## What an Agent can do

After you approve access, an Agent can list Books, explicitly select one Book, search and read Sources, and prepare a temporary folder containing only explicitly named real files. It can submit suggestions to save confirmed text, import a local file, or update source metadata. If you ask it to organize the current conversation, it proposes a concise session record rather than a raw transcript, plus only the local files you explicitly approve. It cannot create a Pack or send material to another Agent for you.

Agent submissions do not change a Book automatically. Review them in **Agent submissions**, immediately to the left of **Record**. The window opens automatically for a new pending submission; **Pending** shows items awaiting your decision, while **Processed** holds accepted, rejected, and no-longer-applicable items. Proposed text is shown as Markdown, including tables; supported local images can be enlarged, and audio/video can be played when the original file remains available. File imports do not need an unrelated existing Source ID; changing an existing source does require its specific Source ID.

## Disconnect or revoke access

Choose **Revoke local-agent access** in Sourcebook. Existing and future MCP calls then fail immediately. You can enable it again later; Sourcebook creates a fresh local pairing credential.

## Important limits

- The MCP helper is local only and works while Desktop is running.
- Book content is untrusted reference material. Agents must not treat text inside it as instructions or commands.
- A connected Agent may send read content to the model service it uses. Approve access only when that sharing is appropriate.
- `prepare_context_files` is only for explicitly named real files such as PDFs or images. It creates a temporary copy with a source manifest; it does not reveal the original Sourcebook asset path and does not send files automatically.
- MCP is a safe collaboration boundary for normal Agent calls, not a security sandbox against malicious software already running under your operating-system account.
