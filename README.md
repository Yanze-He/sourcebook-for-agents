# Sourcebook — Local Context Relay for AI Agents

**你的 AI 素材中转站。** 从网页和本地收集素材，按项目放进 Book，挑出当前任务需要的内容，再交给 AI 使用。

**A local-first context relay for AI agents.** Collect references, files, links, and AI conversations from the browser or your computer. Organize them in project Books, then hand off only the context you choose through MCP or copy and paste.

[Visit the website](https://sourcebook.online) · [Get started](docs/getting-started.md) · [Connect an Agent](docs/connect-agents.md)

https://github.com/user-attachments/assets/5f0956cf-81d9-4861-a663-5596113db402

## Collect, choose, relay

1. **Collect.** Use Sourcebook Picker on supported webpages, or add files, links, text, and clipboard content in Desktop.
2. **Organize.** Keep each project in a Book. Browse, search, filter, annotate, and select only the materials relevant to the task.
3. **Relay.** Connect Codex or WorkBuddy so the Agent can read the current Book and the selection or filter in its connected page. For other AI tools, copy selected files or links, or prepare a Pack with a prompt you can paste yourself.

Sourcebook keeps the library on your computer. It does not send a Pack or a prompt to an AI tool on your behalf. A connected Agent can read materials when you ask it to; review its proposed changes in Sourcebook before they are saved.

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
