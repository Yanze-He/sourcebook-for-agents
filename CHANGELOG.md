# Changelog

All notable user-facing changes are documented here.

## Unreleased

- Save a source note when the detail panel is dismissed by clicking outside it.
- Keep the Windows Desktop system-tray icon responsive across relaunches, prevent multiple tray hosts, and restore the icon after Explorer restarts.
- Keep the Windows tray host out of the taskbar; let the desktop shortcut open Sourcebook through the default browser, whose closure does not stop the tray host or local service. Quit the process from the tray menu.
- Version the Agent Plugin independently from Desktop, add separate macOS/Windows archive builds and a GitHub-based install/update guide, and check for Desktop before an Agent changes its configuration. If Desktop is missing, direct users to sourcebook.online. Independent installations live outside Desktop's refreshed fallback bundle.
- Refresh Codex's cached Sourcebook Plugin on reinstall, so same-version Desktop builds update the MCP and Skill. The installation guide now explains what to do if Codex cannot write its plugin cache.
- Give the Codex Plugin a flat Sourcebook icon. Simplify the Agent connection window with a compact version-help control, an installation-target picker beside the copy action, and clearer local-access wording; Agent submissions now link directly to connection settings.
- Show the Desktop-bundled Agent component version in the connection window. Stamp the same version and test-build label into MCP and Skill documentation, and have WorkBuddy verify and report both components' version after installation.

- Add a direct feedback form for the website, Picker, and Desktop backed by a private SQLite store and password-protected admin API. Keep GitHub Issues as an alternative, remove region-specific Discord/WeChat descriptions, and preserve the shared landing-page header, language selector, and footer.
- Simplify the feedback-page header to show Feedback and GitHub, followed by the language selector and Download CTA; remove homepage section links from this page.
- Point Picker's disconnected-state **Download app** button to the Sourcebook landing-page download section, and localize the popup's Pick tools and Recent picks accessibility labels when the language changes.
- Allow the published Chrome Web Store Picker to connect to Desktop while continuing to reject all other extensions. **Install Picker** now opens its Chrome Web Store page directly.
- Add Sourcebook MCP: a paired local stdio bridge for Codex and compatible Agents.
- Add user-reviewed Agent suggestions for text sources, local-file imports, and metadata updates.
- Remove duplicate title and note previews from editable Agent submissions; prefilled fields save automatically on blur, and Accept waits for the latest edit.
- Bundle `sourcebook-mcp` and the optional Codex plugin template inside macOS and Windows Desktop installers. Any compatible local Agent uses the same `sourcebook` stdio MCP namespace; `@` and slash commands are optional host shortcuts rather than prerequisites.
- Add Desktop-generated install/update prompts for Codex and WorkBuddy. Codex now registers, installs, and verifies the bundled Plugin in one repeatable helper step; WorkBuddy checks the bundled Skill and updates only its own Sourcebook MCP configuration and Skill.
- Keep the bundled Agent installer in a stable user-level Sourcebook support folder, so setup keeps working when Desktop is moved, renamed, installed on another disk, or updated. The Agent connection screen now focuses on enabling access, choosing an Agent, and copying a short local-guide request.
- Let Codex install or update the bundled Plugin without requiring its installation task to reach Sourcebook's local service. Desktop now also replaces a running service when its tested build label changes, even when its semantic version is unchanged.
- Fix the bundled Codex marketplace manifest location so Codex can register it. The Agent connection window now shows copy feedback beside the installation action, uses the same picker style as the rest of Desktop, and removes the redundant guide link and status badge.
- Migrate Codex's Sourcebook marketplace registration when the app or bundled Agent path changes, and verify that the enabled plugin points to the current bundle. Move **Revoke access** into the connection-status panel.
- Keep Codex CLI warnings separate from JSON output during Plugin installation. The copied install request now contains only the local guide path, while the installer guide defines its short completion message.
- Declare both current and legacy MCP App resource metadata. `open_sourcebook` makes clear that its URL is not proof a panel opened; if a host such as WorkBuddy does not render the App, its Agent should open the URL in the built-in browser panel.
- Allow newly generated files to be proposed for import without an unrelated existing Source association, and keep the Agent's save confirmation focused on the target Book and pending review.
- Rename the review window **Agent submissions** and separate pending from processed items. Render proposed text as Markdown, let users enlarge submitted images or play local audio/video, and present metadata changes without raw JSON. New text/file proposals cannot carry unrelated Source IDs, while metadata proposals must contain a real change.
- Render Markdown tables as readable, horizontally scrollable tables in text cards and Agent submissions, and keep table structure when editing a text card.
- After an Agent submits content for review, guide it to bring Sourcebook into view so the user can accept or reject the submission.
- Give newly created Books name-independent UUIDs while preserving existing Book IDs and readable folder names. Backup imports that collide with an existing ID also receive a new UUID.
- Refine MCP around ongoing project work: it now makes saving proposals explicitly user-requested, supports user-requested conversation wrap-ups as concise session records, reserves temporary file export for named real files, and no longer exposes Agent-created Packs.

## v0.1.1-beta.5

- Simplify update notices: Settings and the Version & updates menu use a compact round badge instead of an extra text label.
- Give Desktop installers and Picker downloads versioned filenames, so files from different releases are easy to distinguish.

## v0.1.1-beta.4

- Update notices clear as soon as the installed Desktop version catches up with the reported release, instead of waiting for a later scheduled check.
- The Settings control keeps its available-update label visible, uses a round corner badge, and shows an explicit update state in its menu.
- Settings and refresh tooltips stay above the sources toolbar when hovered.

## v0.1.0-beta.3

- Desktop now identifies an older local Sourcebook service after an update, restarts it before opening the new app, and reloads the existing browser tab with the newly bundled Sources page.
- Windows and macOS Desktop builds carry their own version through startup, so the correct local service is used after an upgrade.
- The Windows installer requests that a running Sourcebook Desktop close before replacing it, avoiding an upgrade that leaves the old tray process active.
- Update notices now clear as soon as the reported release is the installed version, rather than waiting for the next scheduled check.
- The Settings control keeps an available-update label visible, uses a round corner badge, and shows an explicit update state in its menu.

## v0.1.0-beta.2

- Desktop's **Install Picker** entry now opens the GitHub Releases overview, so users can find the current Picker download instead of landing in its source folder.

## v0.1.0

- Add explicit batch mode, per-Book reusable selections, three card densities, and broader search across source metadata, notes, posts, chats, and text content.
- Let users choose a local library location on first use, migrate an existing library safely, back up or restore Books, and reveal the library in Finder or Explorer.
- Add Settings → Version & updates for quiet GitHub Release checks and manual installer downloads.
- Refresh the macOS Dock icon, remove the menu-bar helper, and add branded Windows shortcut icons.
- Keep the local library local: migration validates the destination before switching and cleans the previous location only after success.
- Improve first-run setup with an optional backup import when the library is empty.
- Fix Picker and Desktop packaging so released apps carry the matching version number.

- Restrict the local API to the bundled Picker and the local Desktop page.
- Picker needs to be reloaded from the updated release ZIP once so Chromium adopts its stable extension ID.
- Make backup replacement explicit; cancelling backup import now leaves the current library unchanged.
- Keep a recoverable copy of the previous library after an explicit replacement.
- Add Go tests to the required CI checks and align Windows release builds with the pinned Go toolchain.

## v0.1.0-beta.1

Initial beta release for local testing.

- Local-first Desktop app for macOS and Windows.
- Chromium Picker extension for web text, links, images, and supported chat messages.
- Books, local imports, manual text records, notes, selection, and Pack preparation.
- Local backup export and import.

Known limitations:

- The macOS DMG is Developer ID signed and notarized.
- The Picker is installed manually from the included ZIP; it is not in the Chrome Web Store.
- Firefox, Safari, cloud sync, accounts, team workflows, and a published Windows installer are not included.

## Release policy

- Public releases use semantic version tags such as `v0.1.0-beta.1`.
- A release includes a Chromium extension ZIP, macOS DMG, Windows installer, checksums, and release notes.
- Breaking changes to local storage or Pack format require migration and recovery notes.
