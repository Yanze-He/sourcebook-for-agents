# Local API

The local service is intentionally loopback-only and is not a general-purpose local integration API. It accepts requests from the local Sources page and the bundled Picker extension; other websites and browser extensions are rejected. Do not write SQLite files directly. A future third-party integration needs its own authenticated pairing design before using these routes.

## Create a Source

`POST /api/sources` creates a Source in the supplied `bookId`. If omitted, the active Book is used. Every request also creates a `manual_create` Pick so Source provenance remains consistent with browser Picks.

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
