# Privacy Policy

Last updated: October 7, 2026

## Local-first data handling

Sourcebook for Agents collects content only after a user-triggered Pick action. The core product stores picked Sources, notes, media copies, and exported Packs on the user's computer. It does not require an account and does not operate a cloud synchronization service.

The browser extension may store pending Picks and recent Pick summaries in the browser's local extension storage while the local Desktop is unavailable. When the Desktop is running, it stores Sources in a local SQLite database and media copies in the user's Sourcebook data directory.

## Data that may be picked

Depending on the user's action, Picked data can include selected webpage text, URLs, page titles and metadata, image URLs or image bytes, loaded chat messages, user notes, and Pick timestamps. The extension does not intentionally collect password fields or browser-internal pages.

## Sharing

Sourcebook for Agents does not transmit picked content to a Sourcebook-operated cloud service. Users may manually download a Pack or paste its contents into a third-party AI service. Those services are governed by their own terms and privacy policies.

## Security and retention

The local service binds to `127.0.0.1` only. Users control retention by deleting Sources, clearing extension storage, or removing the local data directory. Replacing a library from a backup moves the previous library aside first so it can be recovered if replacement is interrupted. Removing the Desktop does not automatically remove the data directory.

The Desktop accepts local Picker requests only from the bundled Chromium extension (`cehohknopnehbkiokoffhfjepaieapan`) and from the local Desktop page. It does not grant access to other browser extensions or websites.
