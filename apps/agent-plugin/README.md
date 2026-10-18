# Sourcebook Agent Plugin

This folder is the independently versioned Sourcebook Agent Plugin source. A
versioned macOS or Windows ZIP is built from it and published under an
`agent-v…` GitHub Release. The install/update guide is
[`docs/install-agent-plugin.md`](https://github.com/Yanze-He/sourcebook-for-agents/blob/main/docs/install-agent-plugin.md).

Desktop also includes a fallback copy, but never updates an independent
installation. The Agent downloads and verifies its own update from GitHub,
then installs it to a separate user-level `agent-plugin-installed` directory.
If Desktop is absent, installation stops and points the user to
https://sourcebook.online.

The helper connects only through Sourcebook Desktop’s protected local bridge; it never opens Sourcebook SQLite databases or asset folders directly. Desktop must remain running and local-agent access must remain enabled when the Agent uses Books.

The bundled `sourcebook` Skill intentionally stays small: it guides project work from a selected Book, creation using Book context, and a user-requested conversation wrap-up. It does not add data permissions beyond the accompanying MCP server.
