# Sourcebook Agent Skill retired

Sourcebook no longer distributes an Agent Skill or marketplace plugin. The
Desktop application supplies the local MCP server, the runtime instructions,
and the tool descriptions used by supported Agents.

To connect a supported Agent, open **Settings → Connect an Agent** in
Sourcebook Desktop and follow the host-specific flow for Codex or WorkBuddy.
For the complete current instructions, see [Connect Sourcebook to an
Agent](connect-agents.md).

## If you installed the legacy marketplace package

Remove the old Sourcebook plugin or Skill from the host's plugin settings.
It is no longer updated and may contain outdated workflow instructions. Then
connect Sourcebook Desktop again and start a new Agent conversation so that it
loads the Desktop-managed `sourcebook` MCP server.

Do not install a marketplace package, copy a helper, or edit an Agent's MCP
configuration by hand. Desktop manages its own supported connections and keeps
the local launcher current when Desktop is updated.
