# Chrome Web Store listing — Picker for Agent

This file is the approved source copy for the Picker listing. Update it together
with the Store privacy disclosure whenever permissions, captured data, supported
sites, or connection targets change.

## Store fields

- **Name:** Picker for Agent
- **Category:** Productivity
- **Support URL:** https://sourcebook.online/obsidian-plugin/
- **Privacy policy:** https://sourcebook.online/privacy.html
- **Contact:** innovationhyz@gmail.com
- **Package:** `artifacts/sourcebook-picker-0.1.3-chrome-web-store.zip`

### Short description

Pick web pages, links, media, and AI chats into Sourcebook for Obsidian or
Sourcebook Desktop—local, organized, and ready for your next agent task.

### Detailed description

Save what matters from the web, then keep it ready for the next task.

Picker for Agent lets you save useful material from the page you are already
reading directly to a Book in Sourcebook. It works with either connection target
you use:

- **Sourcebook for Obsidian** — pair Picker with the Sourcebook plugin in your
  current Obsidian Vault.
- **Sourcebook Desktop** — connect to the Sourcebook app running locally on
  your computer.

Pick selected text, links, images, video and audio references, webpage metadata,
social posts, and useful messages from supported AI chats. Every Pick retains
its source, title, and available media information, so you can find it again,
organize it by project, and prepare focused context for the agent you choose.

### How it works

1. Install Sourcebook for Obsidian or start Sourcebook Desktop.
2. Open Picker for Agent on a webpage.
3. Choose **Connect Obsidian** and enter the pairing code, or choose
   **Connect Desktop App** and connect to the running app.
4. Choose a Book and Pick what matters.
5. Return to Sourcebook to review, organize, or prepare the material for an
   agent.

### Local-first by design

Picker connects only to the local Sourcebook target you choose. It has no
Sourcebook account and no cloud sync. You decide what to save and which Book it
belongs to.

### Permissions and data use

Picker uses `activeTab`, `contextMenus`, `storage`, `alarms`, and website access
only to perform user-initiated Pick actions, keep local connection settings, and
show the extension on supported webpages. It may process website content and
selected AI-chat messages that you explicitly choose to save. Picker does not
sell or transfer this data to third parties, use remote code, or use it for
advertising. See the privacy policy for details.

## 中文产品介绍

Picker for Agent 可以把网页、链接、图片、视频和音频来源、帖子，以及支持的
AI 对话保存到 Sourcebook 的指定 Book。它支持两种本地连接方式：

- **连接 Obsidian：** 使用当前 Vault 中的 Sourcebook 插件配对码连接。
- **连接 Desktop App：** 连接正在本机运行的 Sourcebook Desktop。

每次 Pick 都会保留来源、标题和可用的媒体信息。你可以随后在 Sourcebook 中
整理素材，并按需要把选中的上下文交给任意 Agent。无需 Sourcebook 账号，也
没有云端同步；素材只保存到你选择的本地 Sourcebook。

## Upload checklist

1. Run `npm run typecheck`, `npm test`, and `npm run zip:store`.
2. Confirm that the ZIP's `manifest.json` has the intended version and **does
   not** contain a `key` field.
3. Upload the ZIP in Chrome Web Store Developer Dashboard.
4. Paste the short and detailed descriptions above; update support, privacy and
   data-use disclosures if Store fields have changed.
5. Recheck the resulting Store extension ID against the Desktop allow-list
   before submitting the update.
