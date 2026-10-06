# Sourcebook for Agents

一个本地优先的 Agent 素材工具：**Pick -> Sources -> Pack**。

- **Pick**：Chromium 浏览器扩展，用于捕获网页文字、图片、链接、网页卡片和已加载的 Agent 对话。
- **Sources**：在本地浏览器工作区查看、筛选和选择已捕获的素材。
- **Pack**：将选中的素材和上下文导出为可交给 Agent 的 ZIP。

所有内容默认保存在用户电脑；本项目不依赖账号或云端服务。

## 使用本地开发版

前提：Node.js 22.18+、npm、zip/unzip。macOS 和 Linux 支持完整本地开发；Windows 用于打包 Windows 安装程序。

```bash
npm run setup
npm run build
npm run dev:companion
```

Companion 会启动仅限本机访问的服务，并在默认浏览器打开 Sources。用户数据保存在：

- macOS：`~/Library/Application Support/Sourcebook for Agents`
- Windows：`%APPDATA%\\Sourcebook for Agents`

加载扩展：打开 Chromium 的扩展管理页，开启开发者模式，选择“加载已解压的扩展程序”，然后选取 `apps/capture/.output/chrome-mv3`。

## 安装包与发布

`npm run package:macos` 在 macOS 生成 Companion DMG；`npm run package:windows` 在 Windows 生成安装器输入目录。GitHub Actions 的手动发布工作流会生成 Chromium 扩展 ZIP、macOS DMG 和 Windows 安装程序。

首次发布前必须完成：软件许可证、隐私说明、浏览器商店资料，以及 macOS/Windows 的签名凭据配置。仓库是否公开和软件许可证是两个独立决定；当前仓库保持 private。

## 贡献边界

| Area | Path | Responsibility |
| --- | --- | --- |
| Pick | `apps/capture` | 浏览器扩展、网页/媒体/对话捕获、暂存队列、扩展体验 |
| Sources | `apps/workspace/src` | 素材列表、预览、选择和来源信息 |
| Pack | `apps/workspace/server` | Pack API、附件、ZIP 与本地数据模型 |
| Companion | `apps/companion` | 本地服务启动、浏览器打开、用户数据目录、安装包 |

提交前运行：

```bash
npm test
npm run build
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)、[架构说明](docs/architecture.md) 和各模块贡献指南。
