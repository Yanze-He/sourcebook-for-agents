# Sourcebook — The Creative Materials Hub for AI

**Collect references. Relay the right materials across AI tools. Keep building on the same Book.**

As agents take on more execution, creators can spend less time specifying every step and more time setting the goal, choosing references, and judging the result. Sourcebook keeps those references in a growing local Book and helps you bring the right set into each AI task.

[Visit the website](https://sourcebook.online) · [Chinese README](README.zh-CN.md) · [Get started](docs/getting-started.md) · [Connect an Agent](docs/connect-agents.md)

https://github.com/user-attachments/assets/5f0956cf-81d9-4861-a663-5596113db402

## References that travel and grow

- **Give direction through references.** Choose images and notes that show the look, subject, or constraints you want. Give the Agent a clear goal instead of scripting every step.
- **Carry that direction across AI tools.** Select what each task needs from the same Book rather than rebuilding your references in every chat.
- **Make each round improve the next.** Judge the result, keep useful references, and review Agent-proposed additions or edits before they enrich the Book.

<img width="1672" height="743" alt="Sourcebook project Books and material cards" src="https://github.com/user-attachments/assets/5f762a1d-7c0e-4456-8310-d01e3eae12f7" />

## How it works today

Picker can save X and Xiaohongshu post text with available author and source details, plus selected or loaded messages from ChatGPT, Gemini, DeepSeek, and Grok conversations. It also captures images and selected text from ordinary webpages—more than a URL bookmark. You can add local files, links, and clipboard content in Desktop. [See supported sites and media limits](docs/supported-sites.md).

<img width="1920" height="600" alt="Collecting material from a webpage with Sourcebook Picker" src="https://github.com/user-attachments/assets/691e3784-55f6-49fd-8ef7-a020021cffad" />

- **Codex and WorkBuddy:** Connect from Desktop. When asked, the Agent can read the Book and the selection or filter in its connected Sourcebook page through local MCP. No separate Agent plugin or Skill is needed.
- **Other AI tools:** Copy selected files or links, or prepare a Pack with a prompt, then paste them into the tool yourself.

<img width="1470" height="855" alt="Connected Agent working with a Sourcebook Book" src="https://github.com/user-attachments/assets/a98b72a2-346f-44c3-b76a-aba65413aac5" />

## Local-first by design

Picker sends saved materials to Sourcebook Desktop on your computer. Books and successfully saved media files stay in your local library; no Sourcebook account or cloud sync is required. A connected Agent may send content it reads to its model provider. [Read the privacy details](docs/privacy.md).

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
