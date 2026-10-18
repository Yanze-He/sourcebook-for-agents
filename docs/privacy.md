# Privacy Policy

Last updated: October 7, 2026

## Local-first data handling

Sourcebook for Agents collects content only after a user-triggered Pick action. The core product stores picked Sources, notes, media copies, and exported Packs on the user's computer. It does not require an account and does not operate a cloud synchronization service.

The browser extension may store pending Picks and recent Pick summaries in the browser's local extension storage while the local Desktop is unavailable. When the Desktop is running, it stores Sources in a local SQLite database and media copies in the user's Sourcebook data directory.

## Data that may be picked

Depending on the user's action, Picked data can include selected webpage text, URLs, page titles and metadata, image URLs or image bytes, loaded chat messages, user notes, and Pick timestamps. The extension does not intentionally collect password fields or browser-internal pages.

## Sharing

Sourcebook for Agents does not transmit picked content to a Sourcebook-operated cloud service. Users may manually download a Pack or paste its contents into a third-party AI service. Those services are governed by their own terms and privacy policies.

If a user explicitly enables **Connect local agent** and connects the MCP helper bundled with Sourcebook Desktop, Sourcebook can provide a local Agent such as Codex with Book data through Sourcebook MCP. The Agent must explicitly choose a Book for its session. Read content may be sent to the model service used by that Agent, so users should enable access only when that sharing is appropriate. MCP suggestions remain pending until the user accepts or rejects them in Sourcebook.

## Security and retention

The local service binds to `127.0.0.1` only. Users control retention by deleting Sources, clearing extension storage, or removing the local data directory. Replacing a library from a backup moves the previous library aside first so it can be recovered if replacement is interrupted. Removing the Desktop does not automatically remove the data directory.

The Desktop accepts local Picker requests only from the downloadable Chromium build (`cehohknopnehbkiokoffhfjepaieapan`), the Chrome Web Store build (`pkglhngkfkjblabnhgcioindjgffgfpf`), and the local Desktop page. It does not grant access to other browser extensions or websites.

MCP pairing credentials are stored only in Sourcebook's owner-only local settings file; they are not placed in a Codex configuration, a prompt, or this repository. Revoking local-agent access invalidates the pairing immediately. Sourcebook retains a limited local MCP activity record (time, Agent name, selected Book, tool, and outcome), not the full source content, prompt, or credential.
