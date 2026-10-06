# Contributing to Sourcebook for Agents

每个 PR 尽量只涉及一个贡献区域：

| Area | Start here | Owns |
| --- | --- | --- |
| Pick | `apps/capture` | 浏览器扩展、捕获逻辑、暂存队列与扩展 UX |
| Sources | `apps/workspace/src` | Sources 列表、选择、预览和本地工作区 UX |
| Pack | `apps/workspace/server` | Source Pack API、prompt、附件与 ZIP 导出 |
| Companion | `apps/companion` | 本地启动、浏览器打开、用户数据目录、安装器 |

## 本地开发

```bash
npm run setup
npm run build
npm run dev:companion
```

浏览器扩展以开发者模式加载 `apps/capture/.output/chrome-mv3`。模块级校验命令写在 `docs/contribution/` 对应文档中。

## PR 要求

- 描述受影响的贡献区域和用户可见变化。
- 添加或更新聚焦测试。
- 提交前运行 `npm test` 和 `npm run build`。
- 不要提交 SQLite 数据库、媒体缓存、导出的 Pack、浏览器存储、签名证书、商店密钥或安装产物。
- 本地 API 仅能绑定 loopback 地址。任何 API 兼容性变化必须版本化。
