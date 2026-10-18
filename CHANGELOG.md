# Changelog

All notable user-facing changes are documented here.

## v0.1.1-beta.6

- Allow the published Chrome Web Store Picker to connect to Desktop while continuing to reject unknown extensions. **Install Picker** now opens its Chrome Web Store listing.
- Add a paired local MCP bridge for working with one explicitly selected Book at a time. Agents can search and read Sources, then submit user-requested text, file-import, and metadata changes for review rather than changing a Book immediately.
- Add **Agent submissions** with separate pending and processed views, readable Markdown and tables, and previews for supported media. After submitting, an Agent is guided to bring Sourcebook into view for review.
- Give newly created Books name-independent UUIDs while preserving existing Book IDs and readable folder names.
- Add a simpler **Connect an Agent** flow for Codex and WorkBuddy. The separately versioned [Sourcebook Agent Plugin](https://github.com/Yanze-He/sourcebook-plugin) can be installed or updated without replacing Desktop; Desktop still carries a fallback helper and Skill.

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
