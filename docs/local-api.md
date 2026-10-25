# Local API

The local service is intentionally loopback-only and is not a general-purpose local integration API. It accepts requests from the local Sources page plus the approved downloadable and Chrome Web Store Picker builds; other websites and browser extensions are rejected. Do not write SQLite files directly.

Sourcebook MCP uses a separate paired bridge API, not these browser routes. The native `sourcebook-mcp` helper is supplied by the independently installed Sourcebook Agent Plugin, requires an explicit Book selection for every MCP session, and can read data, explicitly create or rename Books, or create pending user-reviewed suggestions. Multi-item suggestions are stored as one durable review batch; they are never applied to a Book until the user accepts them in Sourcebook. See [Connect Sourcebook to an Agent](connect-agents.md).

## Paste to the current Book

The Sources page handles a user-initiated Cmd/Ctrl+V outside editable controls. Before anything is saved, it immediately presents one confirmation view containing every recognized and unsupported pasted item; it does not probe the native clipboard at paste time. `POST /api/clipboard/files` is an internal Desktop-only helper that reads copied local file references and returns display metadata plus a short-lived, one-time token only after the user confirms a fallback “local file clipboard” item in a browser that exposes no `File` objects. It never returns file paths to the page. Browser-recognized folders are excluded from the browser-file fallback, so a folder is listed only once as unsupported. Confirming streams each supported item to `POST /api/books/:bookId/clipboard-import`; the response records an imported or failed result per item, so the dialog can keep successful items checked and failed items visible with a recovery reason.

There is a limit of 20 files per paste. The confirmation view shows the first 20 files only and states how many additional files were not shown or added. Folders, unreadable paths, non-regular filesystem entries, and unsupported clipboard formats are shown as unsupported before confirmation and skipped, never blocking neighboring files. Any condition that can only be discovered while importing (for example, a file disappearing, an interrupted transfer, or an invalid link) is returned as an item-level failure while the remaining items continue. File imports from the native token and browser-exposed clipboard files are streamed into the Book after confirmation; they may use any extension or size and are not Base64-encoded or held as a full request in page memory. Browser and embedded-agent clipboard policies can still prevent a host from exposing a local file at all; that case is shown as an item-level reason rather than silently discarding the file. On Windows, both the single-path and multi-path JSON shapes returned by the native FileDropList helper are accepted.

## Open stored local files

Sources with a cached local file expose two local-only actions. `POST /api/sources/:sourceItemId/open-local?bookId=...` opens the original with the operating system's default application. `POST /api/sources/:sourceItemId/reveal-local?bookId=...` reveals its containing folder in Finder or Explorer. The page receives only the Book-relative saved location; neither action transmits the file.

## Create a Source

`POST /api/sources` creates a Source in the supplied `bookId`. If omitted, the active Book is used. Every request also creates a `manual_create` Pick so Source provenance remains consistent with browser Picks. Read Book IDs from `GET /api/books`; new Book IDs are opaque UUIDs, not slugs derived from Book names. Existing libraries may retain older name-based IDs.

```json
{
  "bookId": "sourcebook",
  "modality": "text",
  "title": "Competitor positioning",
  "contentText": "…",
  "sourceUrl": "https://example.com/research",
  "sourceLabel": "Market research",
  "note": "Use for the launch brief",
  "favorite": true,
  "metadata": {
    "agent": "research-agent",
    "taskId": "task-42",
    "tags": ["positioning", "launch"]
  }
}
```

Supported `modality` values are `text`, `image`, `video`, `audio`, `file`, `link`, `page`, and `conversation`. Optional fields include `contentUrl`, `thumbnailUrl`, `contentBase64` for images, `faviconUrl`, `pageMetadata`, `conversation`, `pickedAt`, and `pickType`.

To create a Source from a local file, provide `file.name`, `file.mimeType`, and `file.contentBase64`. The file is copied into the target Book. Top-level `title`, `note`, `favorite`, `sourceUrl`, `sourceLabel`, `pickedAt`, and `metadata` still apply.

The response contains `sourceItemId`, `resourceId`, `pickId`, and storage status.

## Create a Picker Pick

`POST /api/picks` is the extension-facing capture endpoint. Unlike manual Source creation, it requires an explicit `bookId`; the service never redirects a Pick to the active or default Book. A missing Book returns `400 BOOK_REQUIRED`; a removed or unknown Book returns `404 BOOK_NOT_FOUND`.

Picker clients should queue only when the local service cannot be reached. Request errors, invalid payloads, and Book errors must be surfaced to the user instead of being retried as offline work.

## Image files and source links

Remote image Sources keep two independent states:

- `linkState`: `linked`, `invalid`, or `none`, describing the original source URL.
- `assetCacheState`: `pending`, `downloading`, `cached`, `missing`, or `failed`, describing the managed local copy.

Creating or picking a supported public image URL automatically starts an attempt to save a managed local copy in the selected Book. The original source URL remains attached for viewing and validation. If a site blocks the request, uses an expired URL, or returns an unsupported response, Sourcebook keeps the source reference and reports that no local copy is available.

`POST /api/sources/:sourceItemId/download?bookId=:bookId` starts an asynchronous image download into the Book's managed files. It returns `202` with `{ "status": "downloading" }`. Poll `GET /api/sources?bookId=:bookId` until the item's `assetCacheState` becomes `cached` or `failed`.

`POST /api/sources/:sourceItemId/validate-link?bookId=:bookId` checks the original image URL. Only an invalid URL, a non-public address, DNS failure, or HTTP `404` / `410` changes `linkState` to `invalid`. Authorization errors, timeouts, anti-hotlinking, and other temporary failures remain unconfirmed and do not invalidate the link.

The older `POST /api/sources/:sourceItemId/retry-download?bookId=:bookId` endpoint remains as an alias for `download` during the migration.
