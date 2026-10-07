# Sourcebook for Agents

> Pick web context. Turn it into clear, reusable context packs for any AI agent.

Sourcebook for Agents is a local-first tool for people who work across the web and AI agents. Pick the references that matter - webpages, images, links, text, and loaded agent conversations - then review and package them into a portable ZIP for your next task.

Your sources stay on your computer. No account or cloud workspace is required for the core loop.

## Why Sourcebook

Useful context is scattered: an image from a product page, a paragraph from an article, a useful link, or part of an agent conversation. Copying it by hand into every new prompt is slow, brittle, and makes it easy to lose where something came from.

Sourcebook gives that context a simple lifecycle:

1. **Pick** - capture useful web content without leaving the page.
2. **Sources** - review the collected references in one local workspace.
3. **Pack** - export selected sources, original links, notes, and locally saved images as context ready for an agent.

It is not another AI generation canvas. It is the local context layer between web research and the agents you already use.

## What You Can Pick Today

- Selected text, links, images, video references, and lightweight webpage cards.
- Individual, selected, or loaded messages from supported agent chat pages.
- Image files saved locally when the source permits download.
- Source URL, title, page metadata, capture time, and a locator for every Pick.

The Chromium extension works independently while the local app is offline: Picks are held in browser storage and sent to Sourcebook when the Companion is available again.

## What a Pack Contains

A Sourcebook Pack is a ZIP file designed to travel with a task. It includes:

- `prompt.txt` with selected source text, notes, titles, and original URLs.
- An `assets/` folder for images that have a local copy.
- Clear warnings for media that can only be referenced by URL.

You choose what goes into a Pack. Sourcebook never sends a prompt or files to an agent for you.

## Quick Start

### Run from source

Requirements: Node.js 22.18+, npm, and `zip`/`unzip`.

```bash
git clone https://github.com/Yanze-He/sourcebook-for-agents.git
cd sourcebook-for-agents
npm run setup
npm run build
npm run dev:companion
```

The Companion starts a loopback-only local service and opens Sources in your default browser. Your data lives on your computer:

- macOS: `~/Library/Application Support/Sourcebook for Agents`
- Windows: `%APPDATA%\\Sourcebook for Agents`

### Load the Picker extension

1. Open Chromium's extension management page.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `apps/capture/.output/chrome-mv3`.
5. Open a webpage, open the extension, and enable **Picker**.

## Project Status

Sourcebook for Agents is an early local-first P1. The current public scope is **Pick -> Sources -> Pack**.

Supported now:

- Chrome and Chromium browsers.
- Local SQLite storage, local image caching, and ZIP exports.
- macOS and Windows Companion packaging scripts.

Not included in this repository:

- Cloud sync, accounts, teams, or billing.
- A project, board, or canvas product.
- Full webpage snapshots, OCR, ASR, or video downloads.
- Firefox and Safari support.

## Repository Map

| Area | Path | Responsibility |
| --- | --- | --- |
| Pick | `apps/capture` | Browser extension, capture logic, pending queue, and Picker UX |
| Sources | `apps/workspace/src` | Source list, previews, selection, and local workspace UX |
| Pack | `apps/workspace/server` | Local API, media cache, Pack creation, and ZIP export |
| Companion | `apps/companion` | Local startup, browser launch, data directories, and installers |

## Development

```bash
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution boundaries, [the architecture guide](docs/architecture.md) for the runtime model, and the module guides in `docs/contribution/` for focused development instructions.

## Privacy and Security

The core product is local-first: the Companion binds only to `127.0.0.1`, and captured Sources are stored in a local SQLite database. Do not expose the local service through a public tunnel or reverse proxy.

Before a public Chrome Web Store release, this project will publish a dedicated privacy policy, extension permission explanation, and secure extension-to-Companion pairing.
