# Sourcebook — Creative Asset Relay for AI Agents

**A local-first visual reference library and creative asset relay for AI agents.** Save images, files, media references, and links in project Books. Choose the materials for your next creative task and bring them into the AI tool you use.

[Visit the website](https://sourcebook.online) · [Chinese README](README.zh-CN.md) · [Get started](docs/getting-started.md) · [Connect an Agent](docs/connect-agents.md)

https://github.com/user-attachments/assets/5f0956cf-81d9-4861-a663-5596113db402

## Collect, choose, relay

1. **Collect.** Use Sourcebook Picker to capture visual references from supported webpages, or add files, links, text, and clipboard content in Desktop.
2. **Organize.** Keep each project in a Book. Browse, search, filter, annotate, and select only the materials relevant to the task.
3. **Relay.** Make the chosen materials available to a connected Agent, or copy them into another AI tool.

Here, **relay** means bringing selected creative references—such as images, files, media links, and notes—into an AI task. A Book is your saved collection; its current selection and filter define the materials you want the Agent to consider. In a Codex or WorkBuddy conversation, the connected Sourcebook page makes that set available through local MCP tools. When you ask the Agent to use it, the Agent can read the selected items and retrieve available files. Selecting a card does not itself send a chat message. With other AI tools, you copy files or links, or prepare a Pack with a prompt, then paste them into the task yourself.

Sourcebook stores your Books on your computer. An Agent's proposed changes appear in Sourcebook for your review and are saved only after you accept them.

<img width="1672" height="743" alt="Sourcebook project Books and material cards" src="https://github.com/user-attachments/assets/5f762a1d-7c0e-4456-8310-d01e3eae12f7" />

## Collect with Picker

Sourcebook Picker is a Chrome and Edge extension for collecting references from webpages, feeds, and supported AI conversations. It can keep source links and available previews alongside the material.

<img width="1920" height="600" alt="Collecting material from a webpage with Sourcebook Picker" src="https://github.com/user-attachments/assets/691e3784-55f6-49fd-8ef7-a020021cffad" />

| Material | Current support |
| --- | --- |
| Pages, links, selected text, and images | Webpages |
| AI conversations | ChatGPT, Gemini, DeepSeek, and Grok |
| Posts | X and Xiaohongshu |
| Video and audio | Source links and available previews |

Some sites restrict media downloads. In those cases Sourcebook may keep the original link or preview without a local media file. See [supported sites and limits](docs/supported-sites.md).

## Two ways to use materials with AI

| | Connected Agent | Copy or Pack |
| --- | --- | --- |
| **Best for** | Working with materials while chatting in Codex or WorkBuddy | Bringing a chosen set of materials into another AI tool |
| **How it works** | Connect from Desktop once. In the Agent's Sourcebook page, choose a Book, select or filter materials, then ask the Agent to use them. | Select materials in Sourcebook, then copy available files or links. Pack can prepare a prompt with the chosen sources and notes. Paste what you need into the AI tool. |
| **Setup** | Desktop connects directly to Codex or WorkBuddy through its built-in local MCP server. No separate Sourcebook Agent plugin or Skill is needed. | No Agent connection is needed. |

An Agent can also submit suggested additions or edits to a Book. They take effect only after you review and accept them.

<img width="1470" height="855" alt="Connected Agent working with a Sourcebook Book" src="https://github.com/user-attachments/assets/a98b72a2-346f-44c3-b76a-aba65413aac5" />

## Install

1. [Download Sourcebook Desktop](https://sourcebook.online/#download) and open it. The current v0.1.4 release includes an Apple silicon macOS installer; Windows x64 remains on v0.1.3.
2. To collect from the browser, [install Sourcebook Picker](https://chromewebstore.google.com/detail/sourcebook-picker/pkglhngkfkjblabnhgcioindjgffgfpf?hl=en-US&utm_source=github_agents_readme&utm_medium=referral&utm_campaign=picker_install) for Chrome or Edge.
3. Create a Book and add your first materials. To work directly with Codex or WorkBuddy, open **Settings → Connect an Agent** in Desktop.

Picker is optional if you only add materials in Desktop. See [Getting Started](docs/getting-started.md) for the full workflow and troubleshooting.

## Contribute

Issues and pull requests are welcome. Good starting points are [Picker](docs/contribution/pick.md), [Books and materials](docs/contribution/sources.md), and [Pack](docs/contribution/pack.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup; the main checks are `npm test` and `npm run build`.

## Documentation

[Getting Started](docs/getting-started.md) · [Use cases](docs/use-cases.md) · [Supported sites](docs/supported-sites.md) · [Connect an Agent](docs/connect-agents.md) · [Architecture](docs/architecture.md) · [Privacy](docs/privacy.md)

## License

Sourcebook for Agents is released under the [MIT License](LICENSE).
