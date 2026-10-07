# Picker Contribution Guide

Use `apps/picker` for browser Pick work.

- Keep Picks generic: text, images, video references, links, lightweight webpages, and recognized chat messages all produce versioned Pick payloads.
- Preserve source URL, title, origin, favicon, locator, and Pick time.
- Keep provider-specific recognition isolated under `src/chat`.
- Do not couple Picker UI to the Sources implementation; communicate through the local API contract.
