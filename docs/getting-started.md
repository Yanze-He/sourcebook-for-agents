# Getting Started

This guide takes you through one complete local workflow: start Sourcebook, connect Picker, collect a few references, and prepare a context pack.

## Before You Start

To run Sourcebook from source, you need Node.js 22.18+, npm, and Go 1.24+. Node builds the web interface and extension; Go builds and runs the local desktop service. Sourcebook currently supports Chrome and other Chromium browsers.

### Release install

Download the macOS DMG and Chromium Picker ZIP from the repository Release page. A Windows installer will appear only in a release where it has been separately verified. The macOS disk image presents **Sourcebook Desktop** beside an **Applications** shortcut: drag the app onto Applications, eject the disk image, then open Sourcebook Desktop from Applications. Sourcebook appears in the Dock; use its application menu to open Sources, restart the local service, or quit.

Before opening an installer, verify its entry in `SHA256SUMS.txt`. Public macOS releases are Developer ID signed and Apple notarized. Do not bypass a macOS verification warning for a build that is missing either signal.

To install Picker, unzip the versioned `sourcebook-picker-chromium-v<version>.zip` download, open `chrome://extensions`, enable Developer mode, then choose **Load unpacked** and select the extracted extension folder.

### Updates

Sourcebook checks GitHub Releases quietly after launch, at most once every 24 hours. When a newer version is available, open **Settings → Version & updates** to read the notes and open its Release page. Download and install the DMG or Windows installer yourself; Sourcebook never downloads or runs an installer automatically.

### Run from source

```bash
git clone https://github.com/Yanze-He/sourcebook-for-agents.git
cd sourcebook-for-agents
npm run setup
npm run build
npm run dev:desktop
```

The Desktop starts the local service at `http://127.0.0.1:4177` and opens Sources in your browser. This service is the local bridge between the extension, your Books, and the Sources interface.

## Connect Picker

1. In Chromium, open the extension management page and enable **Developer mode**.
2. Select **Load unpacked** and choose `apps/picker/.output/chrome-mv3`.
3. Open the extension popup from a normal webpage.
4. Ensure the status says that Picker is ready, then turn **Picker** on.

Picker requires the local Desktop app to be available. When the connection is unavailable, the popup hides the collection controls and offers a refresh action to retry the local connection plus a link to download the Desktop app. It does not turn this into a cloud or account-based workflow.

## Make Your First Picks

Use a small, purposeful set of references so your first Book is easy to inspect:

1. **Pick a page or link** from an article, product page, or documentation page.
2. **Pick selected text** that states the problem, a key constraint, or a useful conclusion.
3. **Pick an image** where visual reference matters. The Picker accepts PNG, JPEG, GIF, and WebP images; if a local copy cannot be saved, Sources retains the reference URL when possible.
4. **Pick a chat excerpt** from ChatGPT, Gemini, DeepSeek, or Grok. Select only the messages that carry the needed decision or reasoning.

For video and audio, Sourcebook preserves the source link. It does not download media files or generate transcripts.

## Review in Sources

Return to the local Sources tab. Each new entry contains the essential context for a later task:

- A title that is deliberately truncated for quick scanning.
- The source website and pick timestamp in `YYYY-MM-DD HH:mm` form.
- A thumbnail for locally saved images, or a centered site favicon for links and chat entries.
- The original URL and available metadata.

Use Books to keep unrelated research separate. Choose the destination Book in Picker before making a Pick.

## Prepare a Context Pack

Select the Sources needed for a single task, add any note that explains the intended outcome, and prepare a Pack. A Pack is an explicit handoff: it gathers your chosen references, their original links, notes, and any locally saved files that are available.

Review the Pack before pasting or sending anything to another AI product. Sourcebook does not submit prompts or files on your behalf.

## Troubleshooting

| Situation | What to check |
| --- | --- |
| Picker is unavailable | Start the Desktop app, then use the popup refresh action to retry its local connection. |
| An image saves as a link only | The site may block browser access or use an expiring URL. The original reference remains visible in Sources. |
| A chat page is not recognized | Confirm that it is ChatGPT, Gemini, DeepSeek, or Grok and that the relevant messages are loaded. Use generic text Pick as a fallback. |
| A Picker change is not visible | Rebuild the extension, reload it from Chromium's extension page, then refresh the webpage. |

For product boundaries and source-specific behavior, see [Supported Sites and Limitations](supported-sites.md). For local data handling, see [Privacy Policy](privacy.md).
