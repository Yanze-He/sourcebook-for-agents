# Connect Sourcebook to a compatible local MCP Agent

**Version:** 0.1.2-beta.4

Use this guide only when the Agent documents both local Skills and a local
stdio MCP server. First check its official setup documentation. Do not assume
Codex or WorkBuddy's installation steps apply to another Agent.

Before changing configuration, confirm Sourcebook Desktop is installed and
running and that **Settings → Connect an Agent → Local access** is enabled. If
Desktop is missing, direct the user to https://sourcebook.online and stop.

If the Agent documents a supported local MCP configuration, add a user-level
stdio MCP server named `sourcebook` using the platform-appropriate bundled
helper:

```text
<directory containing this guide>/.agents/plugins/sourcebook/bin/sourcebook-mcp
```

Use no command arguments and do not add a pairing credential. Set
`SOURCEBOOK_AGENT_NAME` only if the Agent documents support for environment
variables. Install the bundled Skill only if that Agent documents a compatible
user-level Skills directory. Preserve unrelated settings and restart the Agent
or start a new local session after setup.

This setup is an unverified adaptation unless the Agent is explicitly listed as
supported. If its MCP or Skill setup is undocumented, do not edit internal
files or guess. Tell the user that Sourcebook does not support this Agent yet
and support may be considered later. If the helper reports that Desktop is
unavailable, ask the user to open Sourcebook Desktop and retry in a new local
session.

After setup, report only whether it succeeded and the next action the user
needs to take. Do not print command logs or a lengthy review.
