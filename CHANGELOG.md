# Changelog

All notable user-facing changes are documented here.

## Unreleased

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
