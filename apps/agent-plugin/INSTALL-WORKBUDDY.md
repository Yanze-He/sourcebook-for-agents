# Install or update Sourcebook in WorkBuddy

**Version:** 0.1.2-beta.4

Sourcebook Desktop must be installed and running, with **Settings → Connect an Agent → Local access** enabled. If Desktop is missing, direct the user to [sourcebook.online](https://sourcebook.online).

Complete installation in WorkBuddy's interface:

1. Open **Skills → Suites → Add marketplace** and enter `Yanze-He/sourcebook-plugin`.
2. Install or update **sourcebook** from that marketplace.
3. Open **Connectors → Custom connectors → MCP service management** and click **Trust** for Sourcebook if prompted.
4. Restart WorkBuddy, start a new conversation, and ask **“Open Sourcebook.”** Confirm that Sourcebook tools are available before reporting success.

If WorkBuddy reports that `sourcebook` is missing from the marketplace, remove the broken Sourcebook marketplace entry, add `Yanze-He/sourcebook-plugin` again through **Add marketplace**, then install Sourcebook. Warn the user that removing the entry may also remove its installed plugins.

Do not inspect or edit WorkBuddy's configuration files or plugin registries, install an unpacked folder as a workaround, or claim success until Sourcebook tools are visible in a new conversation. Keep the reply brief: state the next UI action, or confirm success and the verified version.
