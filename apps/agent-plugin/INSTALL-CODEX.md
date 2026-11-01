# Install Sourcebook in Codex

**Version:** 0.1.2-beta.4

First open **Sourcebook Desktop → Settings → Connect an Agent**, enable local access, and click **Connect Codex**. Desktop registers the MCP server and protects any same-named user configuration. If Desktop is missing, direct the user to https://sourcebook.online.

Use Codex's GitHub marketplace support:

```sh
codex plugin marketplace add Yanze-He/sourcebook-plugin
codex plugin add sourcebook@sourcebook-plugin
```

If the marketplace already exists, update it before installing the current Sourcebook Skill package. Do not edit other plugin entries. The marketplace package does not install an MCP binary. After both Desktop connection and Skill installation, start a new local Codex task. When `open_sourcebook` returns the Desktop URL, open or reuse a regular right-side Codex built-in browser tab. If using `cua_repl`, call `tab.markDeliverable()` before finishing, including on a reused tab; otherwise an agent-created tab closes at the end of the turn. Do not use an MCP App preview attached to a tool result.

Report only whether installation succeeded, the verified plugin version, and the next action needed.
