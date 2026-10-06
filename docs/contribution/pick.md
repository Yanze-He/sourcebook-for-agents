# Pick Contributions

Use `apps/capture` for browser capture work.

- Keep capture generic: text, images, video, links, lightweight webpages, and recognized chat messages all produce versioned Pick payloads.
- Preserve source URL, title, origin, favicon, locator, and capture time.
- Keep the extension usable while the local Companion is offline by using its pending queue.
- Do not add application-only UI requirements before a Pick can be saved.

Run `npm --prefix apps/capture run typecheck`, `npm --prefix apps/capture test`, and `npm --prefix apps/capture run build` for every Pick change.
