# Connect Sourcebook to a compatible local MCP Agent

**Version:** 0.1.2-beta.1

This guide is included in the independently versioned Agent Plugin archive.

Before changing the Agent's configuration, run the helper's `check-desktop`
command. If it reports Desktop is absent, tell the user to download it from
https://sourcebook.online, then stop without claiming installation succeeded.

Add a user-level stdio MCP server named `sourcebook`. Its command must be the
bundled helper next to this guide:

```text
<directory containing this guide>/.agents/plugins/sourcebook/bin/sourcebook-mcp
```

Use no command arguments and do not add a pairing credential to the Agent's
configuration. Set `SOURCEBOOK_AGENT_NAME` only if the Agent's configuration
supports an environment name. Restart the Agent or start a new local session
after saving its configuration.

The helper reads its own local pairing state when it starts. If it says
Sourcebook Desktop is unavailable, ask the user to open Sourcebook Desktop,
then retry in a new local session.

After setup, report only whether it succeeded and the next action the user
needs to take. Do not print command logs or a lengthy review.
