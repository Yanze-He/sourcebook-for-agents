# Sourcebook — 面向 AI Agent 的创作素材中转站

**本地优先的视觉参考库与创作素材中转站。** 把图片、文件、媒体参考和链接收集到不同项目的 Book 中；开始创作时，挑出这次任务需要的素材，交给你正在使用的 AI 工具。

[访问官网](https://sourcebook.online) · [English README](README.md) · [入门指南（英文）](docs/getting-started.md) · [连接 Agent（英文）](docs/connect-agents.md)

https://github.com/user-attachments/assets/5f0956cf-81d9-4861-a663-5596113db402

## 收集、挑选、交给 AI

1. **收集。** 用 Sourcebook Picker 从支持的网页拾取视觉参考，也可以在 Desktop 中添加文件、链接、文字和剪贴板内容。
2. **整理。** 按项目建立 Book，浏览、搜索、筛选、添加备注，只选出当前任务有关的素材。
3. **中转。** 让已连接的 Agent 使用所选素材，或把素材复制到其他 AI 工具。

这里的**“中转”**指把你选中的图片、文件、媒体链接和备注用于一次 AI 创作任务。Book 保存素材；当前选择和筛选决定这次希望 Agent 参考哪些内容。在 Codex 或 WorkBuddy 对话中，已连接的 Sourcebook 页面会通过本机 MCP 工具向 Agent 提供这个范围。你让 Agent 使用 Sourcebook 时，它可以读取所选素材，并获取可用的文件。单击选中卡片不会自动发出聊天消息。使用其他 AI 工具时，你可以复制文件或链接，也可以用 Pack 准备提示词，再自行粘贴到任务中。

Sourcebook 将 Book 保存在你的电脑上。Agent 建议新增或修改的内容会先出现在 Sourcebook 中，只有你审核并接受后才会保存。

<img width="1672" height="743" alt="Sourcebook 的项目 Book 与素材卡片" src="https://github.com/user-attachments/assets/5f762a1d-7c0e-4456-8310-d01e3eae12f7" />

## 用 Picker 收集素材

Sourcebook Picker 是适用于 Chrome 和 Edge 的浏览器扩展，可以从网页、信息流和受支持的 AI 对话中收集参考资料，并尽可能保留来源链接和预览。

<img width="1920" height="600" alt="使用 Sourcebook Picker 从网页收集素材" src="https://github.com/user-attachments/assets/691e3784-55f6-49fd-8ef7-a020021cffad" />

| 素材 | 当前支持的来源 |
| --- | --- |
| 页面、链接、选中文字和图片 | 网页 |
| AI 对话 | ChatGPT、Gemini、DeepSeek、Grok |
| 帖子 | X、小红书 |
| 视频和音频 | 来源链接和可获取的预览 |

部分网站会限制媒体下载。遇到这种情况，Sourcebook 可能只能保留原始链接或预览，无法保存媒体文件。详见[支持的网站与限制](docs/supported-sites.md)（英文）。

## 两种与 AI 配合的方式

| | 连接 Agent | 复制或 Pack |
| --- | --- | --- |
| **适用场景** | 在 Codex 或 WorkBuddy 对话中使用素材 | 把选定的一组素材带到其他 AI 工具中 |
| **使用方式** | 在 Desktop 中连接一次。在 Agent 的 Sourcebook 页面选择 Book、点选或筛选素材，再让 Agent 使用。 | 在 Sourcebook 中选择素材，复制可用的文件或链接；Pack 可以根据素材与备注准备提示词。随后自行粘贴到 AI 工具中。 |
| **设置要求** | Desktop 通过内置的本地 MCP Server 直接连接 Codex 或 WorkBuddy，无需单独安装 Sourcebook Agent 插件或 Skill。 | 无需连接 Agent。 |

Agent 也可以建议向 Book 新增内容或修改现有素材。只有你审核并接受后，这些改动才会生效。

<img width="1470" height="855" alt="已连接的 Agent 使用 Sourcebook Book" src="https://github.com/user-attachments/assets/a98b72a2-346f-44c3-b76a-aba65413aac5" />

## 安装

1. [下载 Sourcebook Desktop](https://sourcebook.online/#download) 并打开。目前 v0.1.4 提供 Apple 芯片 Mac 安装包；Windows x64 仍使用 v0.1.3。
2. 如果需要从浏览器收集素材，为 Chrome 或 Edge [安装 Sourcebook Picker](https://chromewebstore.google.com/detail/sourcebook-picker/pkglhngkfkjblabnhgcioindjgffgfpf?hl=en-US&utm_source=github_agents_readme&utm_medium=referral&utm_campaign=picker_install)。
3. 创建 Book 并加入第一批素材。如果要直接与 Codex 或 WorkBuddy 协作，在 Desktop 中打开 **设置 → 连接 Agent**。

如果只在 Desktop 中添加素材，可以不安装 Picker。完整流程和故障排查见[入门指南](docs/getting-started.md)（英文）。

## 参与贡献

欢迎提交 Issue 和 Pull Request。可以从 [Picker](docs/contribution/pick.md)、[Book 与素材](docs/contribution/sources.md)、[Pack](docs/contribution/pack.md) 开始。开发环境见 [CONTRIBUTING.md](CONTRIBUTING.md)；主要检查命令为 `npm test` 和 `npm run build`。

## 文档

[入门指南](docs/getting-started.md) · [使用场景](docs/use-cases.md) · [支持的网站](docs/supported-sites.md) · [连接 Agent](docs/connect-agents.md) · [架构](docs/architecture.md) · [隐私](docs/privacy.md)（以上文档目前均为英文）

## 许可证

Sourcebook for Agents 基于 [MIT License](LICENSE) 发布。
