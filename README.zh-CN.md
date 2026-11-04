# Sourcebook — 面向 AI 的创作素材枢纽

**收集参考素材。按任务中转给不同 AI 工具。在同一个 Book 里持续积累。**

当 Agent 承担更多执行工作，创作者就可以少花精力描述每一步，更多地决定目标、挑选参考、判断结果。Sourcebook 将这些参考素材保存在持续丰富的本地 Book 中，帮助你按任务选出并交给合适的 AI 工具。

[访问官网](https://sourcebook.online) · [English README](README.md) · [入门指南（英文）](docs/getting-started.md) · [连接 Agent（英文）](docs/connect-agents.md)

https://github.com/user-attachments/assets/5f0956cf-81d9-4861-a663-5596113db402

## 让参考素材流动，也让创作积累

- **留住灵感的来处。** 把参考图、链接和备注放进 Book，任务结束后仍能找到当时的依据。
- **换 AI 工具，不重新收集。** 每次从同一个 Book 选出需要的素材，不用在不同对话里重新翻找。
- **让上一轮成为下一轮的起点。** 审核 Agent 提出的新增或修改建议，留下有价值的内容供后续创作使用。

<img width="1672" height="743" alt="Sourcebook 的项目 Book 与素材卡片" src="https://github.com/user-attachments/assets/5f762a1d-7c0e-4456-8310-d01e3eae12f7" />

## 现在怎么用

用 Picker 在 Chrome 或 Edge 中收集网页素材，也可以在 Desktop 中添加文件、文字、链接和剪贴板内容。[查看支持的网站与媒体限制](docs/supported-sites.md)（英文）。

<img width="1920" height="600" alt="使用 Sourcebook Picker 从网页收集素材" src="https://github.com/user-attachments/assets/691e3784-55f6-49fd-8ef7-a020021cffad" />

- **Codex 和 WorkBuddy：** 在 Desktop 中连接。你提出请求后，Agent 可以通过本机 MCP 读取其已连接 Sourcebook 页面中的 Book、选择或筛选范围，无需单独安装 Agent 插件或 Skill。
- **其他 AI 工具：** 复制所选文件或链接，或用 Pack 准备提示词，再自行粘贴到 AI 工具中。

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
