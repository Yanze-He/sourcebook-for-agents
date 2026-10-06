# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

WXT browser extension, Node local service, SQLite metadata store.

## Users

Non-code creative workers, heavy AI users, and small creative teams who collect references, prompts, agent outputs, and web materials while working across browser-based tools.

## Product Purpose

The product is a local-first creative context canvas. It captures useful fragments from web pages and tools, stores them in a Global Inbox, and lets users later organize them into projects, boards, exports, or agent context packs.

## Positioning

Unlike AIGC production canvases, the product does not compete on image or video generation. Its durable mechanism is cross-tool context capture and reuse: any useful web material can become a source-traceable Pick.

## Operating Context

The first capture surface is a browser picker. Users pick selected text, images, links, or lightweight page metadata in place while browsing. AI chat pages are handled by the same generic web logic for now; a dedicated AIChatPick design is explicitly deferred.

## Capabilities and Constraints

- Picks default to Global Inbox without forcing project or board selection.
- Page marking is temporary feedback only; no long-term restored web annotations in MVP.
- Browser capture preserves source URL, page title, origin, favicon, locator, and captured time.
- MVP does not do full-page archiving, video timestamps, OCR, ASR, semantic search, or dedicated AI chat adapters.
- Initial browser target is Chrome/Chromium.

## Evidence on Hand

No existing implementation or design system was present in the workspace before this MVP.

## Product Principles

- Keep capture in the user's current working context.
- Make saving instant and reversible.
- Preserve source evidence with every captured item.
- Keep local storage as the default trust boundary.
- Treat Pick as the primitive across text, image, link, and page captures.
