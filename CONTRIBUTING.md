# Contributing to Sourcebook for Agents

每个 PR 尽量只涉及一个贡献区域：

| Area | Start here | Owns |
| --- | --- | --- |
| Pick | `apps/picker` | Browser extension, Pick logic, pending queue, and Picker UX |
| Sources | `apps/sources/src` | Sources list, selection, previews, and local Sources UX |
| Pack | `apps/sources/server` | Pack API, prompts, and local file preparation |
| Desktop | `apps/desktop` | Local startup, browser launch, user data directories, and installers |

## Local Development

```bash
npm run setup
npm run build
npm run dev:desktop
```

Load the browser extension in developer mode from `apps/picker/.output/chrome-mv3`. Module-level checks are documented in `docs/contribution/`.

## Pull Request Requirements

- Describe the affected area and user-visible behavior.
- Add or update focused tests.
- Run `npm test` and `npm run build` before submitting.
- Do not commit SQLite databases, media caches, browser storage, signing certificates, store keys, or installer artifacts.
- The local API must remain loopback-only. Version any API compatibility change.
