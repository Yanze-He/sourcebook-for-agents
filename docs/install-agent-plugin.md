# Install or update the Sourcebook Agent Plugin

This is the guide linked by Sourcebook Desktop's **Connect an Agent** prompt.
Codex and WorkBuddy should use the public GitHub marketplace so future updates
come from a persistent source. Sourcebook Desktop must also be installed, open,
and have **Settings → Connect an Agent → Local access** enabled.

## Codex

Install from the GitHub marketplace in a local Codex task or Terminal:

```sh
codex plugin marketplace add Yanze-He/sourcebook-plugin
codex plugin add sourcebook@sourcebook-plugin
```

If the marketplace is already registered, run
`codex plugin marketplace upgrade sourcebook-plugin`, then run the add command
to install or update the plugin. Restart Codex and start a new local task.

## WorkBuddy

1. Open **Skills → Suites → Add marketplace** and enter
   `Yanze-He/sourcebook-plugin`.
2. Install or update **sourcebook** from that marketplace.
3. In **Connectors → Custom connectors → MCP service management**, trust
   Sourcebook if prompted.
4. Restart WorkBuddy and start a new conversation.

Do not add a temporary download or extracted ZIP folder as a local marketplace.
WorkBuddy stores the folder path as the marketplace source; after that temporary
directory is removed, the plugin may still appear installed but cannot be found
for updates.

If WorkBuddy reports **“Plugin sourcebook is not found in marketplace
sourcebook-plugin”**, the registered marketplace may point to a missing local
folder. Remove that broken marketplace, add `Yanze-He/sourcebook-plugin`,
install **sourcebook** again, then restart WorkBuddy. Removing a marketplace may
also uninstall plugins installed from it, so reinstall Sourcebook afterward.

## Other stdio MCP Agents

For another Agent that supports local stdio MCP, follow the
[manual MCP guide](https://github.com/Yanze-He/sourcebook-plugin/blob/main/.agents/plugins/sourcebook/INSTALL-MCP.md).
Keep the helper at a stable user-level path and register only its `sourcebook`
MCP server in that Agent's user configuration.

If an Agent cannot write its user-level plugin or configuration directories, it
must stop and ask you to use a local task with the necessary access or follow
the manual guide. A downloaded archive alone is not an installed plugin.
