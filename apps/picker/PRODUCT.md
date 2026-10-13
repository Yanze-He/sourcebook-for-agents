# Product

<!-- impeccable:product-schema 1 -->

## Platform

Chrome/Chromium browser extension connected to the local Sourcebook Desktop application.

## Stack

WXT browser extension, Go local service, SQLite metadata store.

## Users

Independent researchers, product and design practitioners, content creators, and agent-workflow builders who collect references, prompts, agent outputs, and web materials while working across browser-based tools.

## Product Purpose

**Sourcebook for Agents** turns useful web material into reusable agent context. The Picker creates Picks; each Pick becomes a Source in the selected Book. Users can review Sources and prepare a Pack for an agent.

## Positioning

The product does not compete with AIGC generation tools or replace a user’s preferred agent. It focuses on collecting, preserving, and preparing cross-tool context with durable source information, so a task can move to any agent the user chooses.

## Operating Context

Picker works in place on webpages. It can Pick selected text, images, links, lightweight webpage metadata, and supported agent messages. Sourcebook Desktop provides the local library, file copies, backup, and the Sources application.

## Capabilities and Constraints

- A Pick is written only to the Book explicitly selected in Picker. Changing it does not change the Book currently open in Sourcebook Desktop.
- Browser-only Picks remain in an automatic sync queue until Sourcebook Desktop and their selected Book are available. A removed Book is never replaced silently; Picker asks the user to choose a new target.
- Image Picks can be stored as web links or copied into the selected Book according to the user's image-saving preference.
- Page marking is temporary feedback only; no persistent webpage annotations.
- Picks preserve the source URL, title, origin, favicon, locator, and Pick time.
- The initial browser target is Chrome/Chromium.

## Product Principles

- Keep Pick actions inside the user's current browsing context.
- Make saving explicit, fast, and reversible.
- Preserve source evidence with every Source.
- Keep local storage as the default trust boundary.
- Use Pick, Sources, Book, and Pack consistently across the product.
