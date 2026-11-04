# Changelog

All notable user-facing changes are documented here.

## 0.1.4 — 2026-11-04

- Limit **Copy links** to selected materials that are available only as links. Materials with a transferable local file stay in **Copy files**, even when they also retain their original web address; the file-copy confirmation stays focused on the copied files and paste destination.
- Add keyboard selection rules: `Ctrl/⌘ + A` selects all currently visible sources and enters selection mode when no popover or dialog is open; `Esc` closes an open surface, or exits selection mode when none is open.
- Add the existing **Copy** action to the ordinary browser selection bar, immediately before **Send to AI**, using the same secondary button treatment as **More**. It retains the Agent-page behavior: copy directly when the selection has one transferable type, or choose files versus links when it has both.
- Keep the **Send to Agent** prompt and its usage guidance in separate, sequential sections when a large material scope is expanded; the modal scrolls as one surface instead of allowing the prompt editor to overlap the guidance.
- Verify WorkBuddy trust from its local approval record when Sourcebook writes or checks the Desktop-managed connection, so the card and Toast distinguish a trusted configuration from one still awaiting approval. In wide Sourcebook pages, keep the selection bar centered and content-sized instead of spanning the entire page; narrow panels retain their one-line layout.
- Simplify **Add materials** to records, local files, and clipboard import; Picker installation remains available from Settings. Tighten **Connect an Agent** by removing its redundant footer information, localizing action feedback, and showing every connect, check, remove, disable, or local-access result as a Toast. WorkBuddy’s secondary action now accurately reads **Disable** because it disables Sourcebook for new conversations rather than deleting its configuration.
- Use one clear copy confirmation across files, links, and prompts: show the copied count and tell the user to paste it into the Agent input.
- Make the Agent page connection action explicit: it shows an in-progress state and confirms whether the tab connected or its connection refreshed. If Desktop is unavailable, the page credential is no longer valid, or the Book disappeared, it shows the concrete recovery reason instead of silently failing.
- Copy links and prompts directly through Sourcebook Desktop in WorkBuddy, where the embedded browser does not grant clipboard-write permission. The same direct-copy interaction remains intact.
- Distinguish Select mode from Agent submissions with a pointer icon. Accepting every pending Agent submission now closes the review window after all items succeed; accepting one item keeps it open.
- Keep Agent submissions in the page that created them. Sourcebook now persists the originating Agent page identity, validates its current page token for review, and never uses a host preview tool to open another page after a proposal. In WorkBuddy, a known connected panel is no longer passed to `present_files`, which can only create a new preview rather than navigate the existing one.
- Retire the separate Sourcebook Agent Skill and marketplace package. Desktop's MCP server now carries the runtime guidance, while individual tool descriptions define tool-specific behavior and side effects.
- Make duplicate browser views of one Agent session deterministic. Exactly one active page may write the conversation's Book, selection, and filter; background refreshes from another view remain passive. A passive page identifies itself and offers an explicit **Use this tab** action. Remove the central selection overlay so it no longer obscures materials.
- Keep a WorkBuddy conversation connected to its existing Sourcebook page when WorkBuddy recreates its local MCP helper. The page restores its own Book, selected materials, and current filter instead of falling back to Desktop's global browsing Book or opening an extra tab.
- Let an Agent read the current page scope directly: selected materials take priority, followed by the materials currently visible through the user's filter. Explicit reconnects retire the old page, which then displays its disconnected state.
- Restore the compact selection workflow: card selection circles have no hover tooltip; selection keeps one row in narrow Agent panels; regular pages offer **More** and **Send to AI**, while Agent pages offer **More** and type-aware **Copy** actions.
- Send each Agent host only its own MCP browser instructions. When a WorkBuddy page is replaced, Desktop now retains a short-lived disconnected record so a frozen panel reports its real replaced state as soon as it resumes, rather than failing with an ambiguous authorization error.

## 0.1.3 — 2026-10-25

- Consolidate Source selection into one shared flow across Desktop and embedded Agent browsers. Pages start in Browse mode; hovering a card reveals its lower-right selection circle, and selecting or drag-selecting enters Select mode with the existing selection veil and action bar. The header now has one mode button instead of a Browse/Select switch or a separate batch-select button.
- Replace the separate Record and local-import header actions with **Add materials**, a compact menu for a record, local files, clipboard content, and Picker installation.
- Make the WorkBuddy connection card match Codex’s action hierarchy: a connected host offers **Check connection** first, with **Remove** as a secondary destructive action; disabled entries offer **Repair connection**.
- Clarify the present WorkBuddy boundary: its configured stdio connector is shared across chats, so its Sourcebook page is shared too. Per-chat browser scope requires WorkBuddy to expose a chat identity or start an MCP process per chat.
- Fix **Show in folder** on Windows. It now opens the local file's parent folder directly rather than relying on Explorer's unreliable legacy selection argument, which could fall back to Documents for some paths.
- Make **Load more** cancellable when switching Books. A late page response can no longer append its old Book's items after the switch, and a stalled local request returns to a retryable state after 20 seconds.
- Add a system **Open** action for every Source with a cached local file. Use it from the card toolbar or the file-detail preview to open the original in the operating system’s default app; details consistently show the Book-relative saved location with a Finder or Explorer reveal action.
- Refine the stored-file detail preview: it now has space below the title area, uses one flat file-identity row instead of nested rounded frames, and places its default-app open icon at the far right.
- Add **Accept all** to the Agent submissions review window. It saves all pending edits first, then accepts the pending suggestions in order; while it runs, other review and close actions are unavailable.
- Keep editable Agent submissions compact by default: their preview comes first, followed by title and note without an extra label. A lower-left **Edit description** action opens fields with **Cancel** and **Confirm** in place of the review actions; leaving a field saves its changes automatically.
- Tighten the **Paste to Book** review window into one scrollable list. Its icons now match each Source’s final type—image, video, audio, file, link, or text—without leaving an empty column or stretching the dialog.
- Open the **Paste to Book** review window immediately without probing the native clipboard. Browser-recognized folders are excluded from the browser-file fallback, so a folder appears exactly once as an unsupported item instead of being duplicated as a file. An embedded browser that exposes only a Files marker defers its native clipboard probe until the user chooses **Add**, so the initial paste never waits or disables confirmation.
- Stream every supported pasted local file directly into its Book instead of Base64-encoding a browser request. Files have no size ceiling; only the first 20 files of a paste are shown and eligible to add; the review window states how many further files were not shown or added. Folders, unreadable paths, non-regular entries, and unsupported clipboard formats are dimmed before confirmation; errors discovered only during import are dimmed per item and never prevent neighboring files, links, or text from importing. Windows accepts the native clipboard helper's single-file and multi-file JSON formats. Successful items receive a check, and the disabled confirmation action reads **Nothing to add** when no pending item remains.
- Separate Sourcebook Desktop from the Agent Plugin completely: Desktop installers no longer include, copy, or update a Plugin. The Plugin starts Desktop on first use when possible, reports exact local-access recovery steps, and can refresh only its own Codex installation when Desktop requires a newer Plugin.
- Make the local-file marker on Source cards reveal its file in Finder or Explorer. Source details now show the Book-relative saved location with the same reveal action, while the file preview continues to open the file itself.
- Add **Paste to Book**: use Cmd/Ctrl+V outside an editor to review and add copied local files, links, screenshots, HTML-as-text, or plain text. Desktop reads copied local-file paths only into a short-lived, one-time import snapshot; it never exposes those paths to the page. A paste may contain up to 20 files and is never silently truncated.
- Replace Pack's small copy popover with a full **Send to Agent** dialog: inspect files and links, tailor the one-off prompt, restore its configured default, and jump directly to prompt-template settings.
- Let local Agents resolve a named Book in one call, create a Book only after an explicit request with retry protection, and rename a Book without overwriting a newer Desktop rename.
- Let Agents submit multiple confirmed Source changes as one review batch. Each batch has a stable status lookup and opens Sourcebook directly to its matching **Agent submissions** review window.

## 0.1.2 — 2026-10-23

- Save source notes when the detail panel loses focus or closes.
- Keep the Windows tray icon responsive across relaunches, prevent duplicate tray hosts, and restore the icon after Explorer restarts. The tray host stays out of the taskbar; opening Sourcebook uses the default browser, and quitting from the tray exits the process.
- Improve Agent submission editing: title and note fields are prefilled, save on blur or when accepting, and no longer duplicate preview text.
- Improve narrow Sourcebook layouts for multi-select and Pack actions.
- Improve agent search and Book reuse, and simplify reuse of an already open Sourcebook browser tab.
- Bundle the latest Agent Plugin v0.1.2-beta.4 as Desktop's offline fallback, and keep the Connect an Agent request pointed at the version-independent guide for installing or updating the standalone package.
- Release the Agent Plugin separately from Desktop, with independently versioned macOS and Windows packages and clearer install/update handling.
- Update Sourcebook Picker to 0.1.5 with a clearer product name, a direct Chrome Web Store link, localized accessibility labels, and only the permissions it uses.

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
- A release includes verified installers only for its stated platforms, checksums, a platform revision manifest, and release notes. The Picker ZIP is included only when that component changes.
- Breaking changes to local storage or Pack format require migration and recovery notes.
