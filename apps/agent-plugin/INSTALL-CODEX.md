# Install or update Sourcebook for Codex

**Version:** 0.1.2-beta.1

This guide is included in the independently versioned Agent Plugin archive.
This installation registers only Sourcebook's local plugin.

1. Let `ROOT` be the directory containing this guide. Run the bundled helper's
   `check-desktop` command. If Desktop is absent, stop and tell the user to
   download Sourcebook Desktop from https://sourcebook.online; do not report
   an Agent installation.
2. Run the bundled helper:

   ```sh
   "$ROOT/.agents/plugins/sourcebook/bin/sourcebook-mcp" install-codex
   ```

   Codex must be allowed to update its user-level plugin cache. If the task's
   sandbox denies that write, request elevated permission for this exact helper
   command and retry once. If elevated execution is unavailable, ask the user
   to run the same command in their local Terminal. Do not claim installation
   succeeded after a permission error.

3. If the helper succeeds, say only: "Sourcebook is installed. Start a new
   local Codex task to use it." If it fails, briefly state the actual failure
   and the action needed. Do not print command logs or a security review.

The helper refreshes Sourcebook's cached plugin on updates. It may install successfully even when the current task cannot reach
Sourcebook's local service. The MCP connection is checked only in the new
local task when the user actually uses Sourcebook.
