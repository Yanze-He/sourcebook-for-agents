# Sourcebook for Agents Architecture

## P1 boundary

The public-ready P1 loop is **Pick -> Sources -> Pack**. The browser extension captures context; the local service owns all durable data; Sources lets users inspect and select material; Pack produces files ready for an agent.

`apps/workspace` is the public P1 host. New P1 work must not require a project, board, group, or canvas concept.

## Runtime topology

```text
Browser extension
       |
       v
127.0.0.1 local service <----> SQLite, media cache, Pack exports
       |
       v
Browser-hosted Sources and Pack workspace
```

`apps/companion` starts the local service in `apps/workspace`, gives it a per-user data directory, serves the built public workspace through localhost, and opens the default browser. The Companion does not add a second web runtime or require users to install Node. This deliberately avoids Electron for P1 while retaining native ownership of SQLite, files, exports and the extension API.

## Source Pack contract

`POST /api/source-packs` accepts an explicit set of `inboxItemIds` and creates a Pack without Project, Board or BoardCard state. The service writes `prompt.txt`, copies locally cached image assets into `assets/`, and makes a ZIP available at `/api/source-packs/:id/download`. This is the public P1 Pack boundary.

## Compatibility

The existing `/api/inbox/*` routes and `inbox_items` storage names remain internal compatibility contracts. Product copy calls the collection **Sources**. Any replacement API must be versioned and keep the current routes working for released Picker versions.

Private products can consume Sources and Pack through the same local profile and local API, but they are deliberately outside this repository.
