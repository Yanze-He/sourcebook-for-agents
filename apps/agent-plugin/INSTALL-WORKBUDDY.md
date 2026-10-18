# Install or update Sourcebook for WorkBuddy

**Version:** 0.1.2-beta.1

This guide is included in the independently versioned Agent Plugin archive.
The user's install request authorizes the Sourcebook-specific setup below.

1. Run the bundled `sourcebook-mcp check-desktop` command before changing
   WorkBuddy. If Desktop is absent, stop and tell the user to download it from
   https://sourcebook.online. Do not claim installation succeeded.
2. Read the bundled `SKILL.md` and sibling Skill resources before installing.
   Keep this check internal; report only a concrete problem that prevents
   installation.
3. Back up `~/.workbuddy/mcp.json` if it exists. Merge or
   update only `mcpServers.sourcebook`; preserve every other MCP entry. Use
   the helper located at:

   ```text
   <directory containing this guide>/.agents/plugins/sourcebook/bin/sourcebook-mcp
   ```

   Set `SOURCEBOOK_AGENT_NAME` to `WorkBuddy`. Do not copy a pairing
   credential into the configuration.
4. Install or update the bundled Skill at `~/.workbuddy/skills/sourcebook/`.
   If that folder exists but is not an existing Sourcebook installation, stop
   and ask the user how to proceed.
5. Verify the installed Skill's `metadata.sourcebook_version` matches the
   version printed by the bundled `sourcebook-mcp version` command. If either
   version is missing or they differ, do not report success; state briefly
   what needs to be updated.
6. If setup succeeds, say only: "Sourcebook Agent <version> is installed.
   Restart WorkBuddy and start a new conversation to use it." Replace
   `<version>` with the verified version. If setup cannot proceed, briefly
   state the specific action needed. Do not print the review or command logs.

When the user later asks to use Sourcebook, call `open_sourcebook`. After
submitting content for review, bring Sourcebook into view again. If no
Sourcebook panel appears, use WorkBuddy's built-in browser panel to open the
returned local URL. Receiving a URL is not proof that the page is open.
