<p align="right"><a href="README.md">English</a> · 简体中文</p>

<p align="center">
  <img src="docs/images/sourcebook-hero-value-v8.png" alt="从浏览器收集素材，保存到 Book，再交给你选择的 Agent 继续创作。" width="100%" />
</p>

# Sourcebook

**为 AI 创作者打造的本地优先素材管理工具。**

每个项目建立一本 Book，集中整理参考资料、文件、链接、帖子和 AI 对话。需要继续创作时，通过 Connect 或 Pack 把项目上下文交给你选择的 Agent。

## 功能一览

| 工作流 | 能做什么 |
| --- | --- |
| **Books** | 按项目整理素材，以瀑布流浏览参考资料和创作进展。 |
| **Pick** | 从网页、图片、帖子和 AI 对话中收集素材，并保留来源。 |
| **Connect** | 让兼容的本地 Agent 搜索选定的 Book，并提交建议供你审核。 |
| **Pack** | 多选素材、添加创作备注，复制上下文到你选择的 AI 工具。 |
| **备份** | 使用 `.sourcebook-backup` 文件导出和恢复 Book。 |

## 从浏览器收集素材

**Sourcebook Picker** 是 Chrome 扩展，可从网页、内容流和 AI 对话中收集素材。

| 素材 | 来源 | 保存内容 |
| --- | --- | --- |
| 文字和页面 | 网页 | 选中文字、页面信息和来源链接 |
| 图片 | 网页 | 支持的图片及其来源链接 |
| AI 对话 | ChatGPT、Gemini、DeepSeek、Grok | 已选择或已加载的消息及角色 |
| 帖子 | X、小红书 | 帖子文字、作者、可用信息和封面 |
| 视频和音频 | 网页 | 媒体链接和可用预览 |

Picker 会尽可能在本地保存图片。部分网站会限制下载；视频和音频以来源引用保留，网页 Pick 也不是整页归档。详见[支持的网站与限制](docs/supported-sites.md)。

<p align="center">
  <img src="docs/images/sourcebook-picker-features-v6.png" alt="使用 Picker 选择 Book、收集对话、媒体和网页内容。" width="100%" />
</p>

## 把项目素材放在一起

每个项目创建一本 Book，以瀑布流浏览素材。导入本地文档和媒体、编写记录、添加备注、搜索筛选，并随时回到原始来源。

<p align="center">
  <img src="docs/images/sourcebook-desktop-features-v7.png" alt="Sourcebook Desktop 中的 Book、素材检索和 Pack 操作。" width="100%" />
</p>

## Connect 或 Pack

| Connect 本地 Agent | Pack 到任意 AI 工具 |
| --- | --- |
| 兼容 MCP 的 Agent——包括 Codex、Claude Code、WorkBuddy 和 Grokbot——可以搜索和读取你选定的 Book。Agent 可准备上下文文件并提交建议，由你在 Sourcebook 中审核。 | 多选当前任务需要的素材，添加备注，再复制提示词以及可用文件或链接。粘贴到 Codex、Claude Code、Figma、Lovable 或其他 AI 工具中继续工作。 |

Agent 不会直接修改或删除 Book 内容。哪些内容要保存、分享给谁，由你决定。

查看 [Agent 连接指南](docs/connect-agents.md)。

## 本地优先，支持备份和恢复

Books 和文件保存在你的电脑上。Sourcebook 不需要账号，也不提供云同步。

你可以把一本、多本或全部 Book 导出为 `.sourcebook-backup` 文件，再在当前设备或其他设备导入。备份包含 Book 数据和本地文件，不包含 Desktop 设置。导入时可以添加备份中的 Book，也可以选择替换当前资料库。

## 安装

1. 从 [Sourcebook Desktop Releases](https://github.com/Yanze-He/sourcebook-for-agents/releases) 下载并安装 Desktop。
2. 从 [Chrome Web Store 安装 Sourcebook Picker](https://chromewebstore.google.com/detail/picker-for-agent/pkglhngkfkjblabnhgcioindjgffgfpf?hl=zh-CN)。
3. 启动 Desktop，打开 Picker 并选择一个 Book。
4. 如需连接 Agent，在 Desktop 中打开 **Settings → Connect an Agent**，按提示完成设置。使用 Pack 时，多选素材并添加备注，然后选择 **Pack for agent**。

当前 beta 支持 Apple 芯片 macOS 和 Windows x64。Picker 支持 Chrome 和 Edge。安装与故障排查请看[快速开始](docs/getting-started.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。可以从以下方向开始：

| 方向 | 贡献建议 |
| --- | --- |
| [Pick](docs/contribution/pick.md) | 增加网站、对话或素材类型支持，改进提取和来源保留。 |
| [Sourcebook](docs/contribution/sources.md) | 改进整理、搜索、筛选和素材详情。 |
| [Pack](docs/contribution/pack.md) | 改进 Agent 交接和上下文提示词。 |

开发环境和约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。开发检查：`npm test` 和 `npm run build`。

## 许可证

Sourcebook for Agents 使用 [MIT License](LICENSE)。

## 文档

[使用场景](docs/use-cases.md) · [支持的网站](docs/supported-sites.md) · [连接 Agent](docs/connect-agents.md) · [架构](docs/architecture.md) · [本地 API](docs/local-api.md) · [隐私](docs/privacy.md)
