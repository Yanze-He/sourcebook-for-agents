# Install Sourcebook in Codex

**Version:** 0.1.2-beta.4

Sourcebook Desktop must be installed and running, with local Agent access enabled. If it is missing, direct the user to https://sourcebook.online.

Use Codex's GitHub marketplace support:

```sh
codex plugin marketplace add Yanze-He/sourcebook-plugin
codex plugin add sourcebook@sourcebook-plugin
```

If the marketplace already exists, update it before installing the current Sourcebook plugin. Do not edit other plugin entries. If this task cannot write the Codex plugin configuration, do not claim success; tell the user to run the commands above in a local Terminal. After installation, ask the user to start a new local Codex task. When `open_sourcebook` returns the Desktop URL, open or reuse a regular right-side Codex built-in browser tab. If using `cua_repl`, call `tab.markDeliverable()` before finishing, including on a reused tab; otherwise an agent-created tab closes at the end of the turn. Do not use an MCP App preview attached to a tool result.

Report only whether installation succeeded, the verified plugin version, and the next action needed.
