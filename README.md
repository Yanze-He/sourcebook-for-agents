<p align="center">
  <img src="docs/images/sourcebook-hero-value-v8.png" alt="From your sources to any agent: pick web material, pack selected context, and continue with the agent you choose." width="100%" />
</p>

# Sourcebook for Agents

Sourcebook keeps web material, AI conversations and local files together, ready to reuse with the agent you choose.

For researchers, designers, creators and people working across AI tools:

- **Research & planning:** Bring references and useful AI answers together for the next analysis or brief.
- **Design & creation:** Keep visual references, posts and project files in one Book.
- **Switching agents:** Carry selected context into the next task without repeating the whole backstory.

## Pick

Save useful material from webpages and supported AI chats into a Book, with its original source attached.

<p align="center">
  <img src="docs/images/sourcebook-picker-features-v3.png" alt="Picker: choose a Book, pick chats, media and pages, and revisit recent Picks." width="100%" />
</p>

| Type | Sources | Saved content |
| --- | --- | --- |
| Text | Webpages | Selected passages and source links |
| Images | Webpages | PNG, JPEG, GIF, WebP and source links |
| AI conversations | ChatGPT, Gemini, DeepSeek, Grok | Selected or currently loaded messages and their roles |
| Posts | X / Twitter, Xiaohongshu | Post text, author, available metadata and cover |
| Pages & links | Webpages | URL, title and available page metadata |
| Video & audio | Webpages | Media links and available previews |

Picker automatically tries to save images locally; blocked downloads remain source links. Web video and audio stay as references, and page Picks are not full-page archives. [Supported sites and limits](docs/supported-sites.md).

## Organise & Pack

Keep materials in Books, add notes, search and filter. Import local documents and media, or write your own records.

Select the material for one task, then copy its files and prompt into your chosen agent. Sources without copyable files are included as links.

Customise the prompt in **Settings → Prompt settings**, using source titles, notes, file names and links. Preview the result or restore the default template.

<p align="center">
  <img src="docs/images/sourcebook-desktop-features-v7.png" alt="Desktop: organise by Book, find sources, select materials for a Pack, and continue in your agent." width="100%" />
</p>

## Local-First

Your Books and files stay on your computer. No accounts, cloud sync or hidden uploads.

- **Export:** choose one, several or all Books for a `.sourcebook-backup` archive.
- **Import:** add backed-up Books or explicitly replace the library. Cancelling either choice leaves the current library unchanged.

Both are available in **Settings**. Backups contain Book data and local files, not Desktop settings. You decide what to share with an agent.

## Get Started

Beta for Chrome and Chromium browsers, including Edge. Firefox and Safari are not supported.

1. Download and install Desktop, and unzip Picker from the [Releases page](https://github.com/Yanze-He/sourcebook-for-agents/releases).
2. In your browser's extension manager, enable **Developer mode**, select **Load unpacked**, and choose the extracted Picker folder.
3. Start Desktop, open Picker on a webpage, turn it on and choose a Book.

Keep Desktop running while using Picker. See [Getting Started](docs/getting-started.md) for installation, release verification and troubleshooting.

### From Source

Requires Node.js 22.18+, npm and Go 1.24.3+.

```bash
git clone https://github.com/Yanze-He/sourcebook-for-agents.git
cd sourcebook-for-agents
npm run setup
npm run build
npm run dev:desktop
```

When running from source, load `apps/picker/.output/chrome-mv3` as the unpacked extension.

## Contribute

- **[Pick](docs/contribution/pick.md):** more websites, AI chats and material formats; better extraction and source retention.
- **[Sourcebook](docs/contribution/sources.md):** better information on cards and in details; improved organisation, search, filtering and batch management.
- **[Pack](docs/contribution/pack.md):** test and adapt handoffs to more agents; explore prompt templates for research, design and creation tasks.

Run `npm test` and `npm run build` for development checks. See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and module boundaries.

## Docs

[Use Cases](docs/use-cases.md) · [Supported Sites](docs/supported-sites.md) · [Architecture](docs/architecture.md) · [Local API](docs/local-api.md) · [Privacy](docs/privacy.md) · [Release & Deployment](docs/release-and-deployment.md)
