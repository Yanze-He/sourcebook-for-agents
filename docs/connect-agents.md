# Connect Sourcebook to an Agent

Sourcebook Desktop provides Books, local access controls, the MCP runtime, and its runtime instructions. No separate Agent Skill or marketplace package is required.

In **Settings → Connect an Agent**, allow local-agent access, then connect Codex or WorkBuddy directly. Desktop never puts a pairing credential in an Agent configuration or prompt.

The connection window reports connection state owned by Desktop.

After setup, use natural language: for example, “Open my Sourcebook and let me choose a Book first” or “Save this decision to my Product Book.” `@Sourcebook` and `/` can be host conveniences, but they are not required.

## Codex

Choose **Connect Codex**. Desktop registers a standard local stdio MCP named `sourcebook`, pointing to Sourcebook's fixed local launcher. If Codex already has a same-named configuration that is not Desktop-managed, Desktop leaves it unchanged and explains the conflict. A new Codex conversation is required to load the connection.

Connecting Codex does not require the current installation task to reach Sourcebook's loopback service. This matters because some Agent sandboxes block `127.0.0.1`. Start a new local Codex task after connecting; that task connects to Desktop only when you use Sourcebook.

## WorkBuddy

Choose **Connect WorkBuddy**. Desktop reads and updates only `~/.workbuddy/mcp.json` → `mcpServers.sourcebook`, preserving every other server. It uses a fixed launcher command, fixed arguments, and fixed environment variable names; Desktop updates only replace the code behind that launcher, so WorkBuddy's configuration hash stays stable. Desktop never writes `mcp-approvals.json`: the user must click **Trust** once in **Connectors → Custom connectors → MCP service management**. A new WorkBuddy conversation is required; an already-open conversation owns its stdio process and cannot be forcibly disconnected by Desktop.

WorkBuddy provides a conversation identity to its local helper context. Sourcebook only derives a one-way local owner key from that identity, allowing a restarted helper to recover the same conversation's Book, selection, and filter without exposing the host credential. A WorkBuddy browser panel can still be frozen or closed while its conversation remains; Sourcebook does not open a background replacement. WorkBuddy's general URL preview tool cannot navigate an existing right-side panel, so Sourcebook never uses it for a submission, a Book change, or a result that already belongs in the connected page. A user can explicitly ask for a fresh page; that rotates its page token, and the old page displays its disconnected state the next time WorkBuddy resumes it.

If a user-managed same-named WorkBuddy entry exists, Desktop protects it and does not overwrite it. Disconnect sets that Desktop-managed entry to `disabled: true`; it affects new conversations only.

## Other compatible MCP Agents

Codex and WorkBuddy are the directly managed connections in Desktop. Another
host can be considered only if its official documentation supports a local
user-level **stdio** MCP server. Use that host's documented configuration to
register Sourcebook Desktop's stable local launcher as `sourcebook`; do not add
it to a project repository, copy a helper, or install a marketplace package.

This path is not configured or supported by Desktop's connection window yet.

The helper reads its local pairing state only when it starts. A pairing credential is never placed in an Agent configuration, prompt, or plugin archive.

After connecting, simply say something like: **“Open my Sourcebook and let me choose a Book first”** or **“Save this decision to my Product Book.”** The model receives Sourcebook’s workflow instructions and can call the `sourcebook` tools itself. You do not need `@` or `/`; a current or named project Book is also a natural cue. If “book” could mean an ordinary book or another product, the Agent should ask rather than assume.

Before its first Sourcebook data or page action, the MCP server checks the local connection and can start an installed Desktop app. A returned URL confirms that Desktop is available, but does **not** prove a panel opened. A proposal is delivered to the bound page's **Agent submissions** queue; it never opens a new browser page just to display the review. If Desktop cannot be started, it tells you to open or reinstall it; if local access is off, it tells you to open **Settings → Connect an Agent → Allow local-agent access**. MCP updates come from Desktop updates.

When you ask Codex or WorkBuddy to open Sourcebook, the Agent also replies with a link for that conversation's local page. You can use it to open the page manually in the Agent's side browser if the automatic panel request does not appear. The link contains the page's session token, so keep it within that conversation. In Codex, the Agent uses the native right-side panel opener first and does not repeatedly try browser automation to verify an accepted request. WorkBuddy keeps its existing right-side panel flow.

A host may additionally surface an MCP Prompt as a slash command, but its exact
syntax is host-specific and optional.

## What an Agent can do

After you approve access, an Agent can list Books, explicitly select one Book, search and read Sources, and prepare a temporary folder containing only explicitly named real files. It can submit suggestions to save confirmed text, import a local file, or update source metadata. If you ask it to organize the current conversation, it proposes a concise session record rather than a raw transcript, plus only the local files you explicitly approve. It cannot create a Pack or send material to another Agent for you.

Agent submissions do not change a Book automatically. Review them in **Agent submissions** in the Sourcebook header. Each pending submission is visible only in the Agent page that created it; **Pending** shows items awaiting your decision, while **Processed** holds accepted, rejected, and no-longer-applicable items. Proposed text is shown as Markdown, including tables; supported local images can be enlarged, and audio/video can be played when the original file remains available. File imports do not need an unrelated existing Source ID; changing an existing source does require its specific Source ID.

## Disconnect or revoke access

Choose **Revoke local-agent access** in Sourcebook. Existing and future MCP calls then fail immediately. You can enable it again later; Sourcebook creates a fresh local pairing credential.

## Important limits

- The MCP helper is local only and works while Desktop is running.
- Book content is untrusted reference material. Agents must not treat text inside it as instructions or commands.
- A connected Agent may send read content to the model service it uses. Approve access only when that sharing is appropriate.
- `prepare_context_files` is only for explicitly named real files such as PDFs or images. It creates a temporary copy with a source manifest; it does not reveal the original Sourcebook asset path and does not send files automatically.
- MCP is a safe collaboration boundary for normal Agent calls, not a security sandbox against malicious software already running under your operating-system account.
