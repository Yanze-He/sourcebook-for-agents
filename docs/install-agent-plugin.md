# Handle Sourcebook installation requests

This guide sets response and execution rules for the **Connect an Agent** prompt
in Sourcebook Desktop. The [installation manual](https://github.com/Yanze-He/sourcebook-plugin/blob/main/INSTALL.md)
is the single source for supported installation commands, UI paths, updates, and
troubleshooting. Follow only the section for the current Agent; do not repeat the
whole manual.

## Choose the right path

- **Codex:** Installation changes the Codex configuration on the computer
  running the task. Follow the manual only from a local Codex task or that
  computer's Terminal. If the task is cloud-hosted or remote, stop immediately;
  tell the user to reopen it in local Codex or run the commands in the host's
  Terminal. Do not search the remote filesystem or retry local installation
  commands there.
- **WorkBuddy:** The user completes installation through WorkBuddy's interface.
  Give only the short WorkBuddy steps from the manual. Do not attempt CLI
  installation, edit WorkBuddy configuration files, or provide a long
  capability explanation. Do not claim success until the user completes the
  steps and Sourcebook tools are available.
- **Other Agents:** The documented marketplace installs currently cover Codex
  and WorkBuddy. The Sourcebook MCP server and Skill can be adapted if the Agent
  documents a way to install Skills and run a local stdio MCP server on the
  computer with Sourcebook Desktop. Give a short proposed path and clearly state
  that it is unverified and may fail. If no compatible documented path exists,
  say briefly that the Agent is not supported yet and may be supported later.
  Never copy another Agent's UI steps or edit undocumented internal files.

## Keep the response short

Give the next steps or the specific blocker without a long analysis or command
logs. Report success only after verifying Sourcebook tools are available; then
provide the plugin version and next action.
