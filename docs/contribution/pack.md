# Pack Contributions

Pack logic lives in `apps/workspace/server/local-api.mjs`.

- A Pack must be generated from selected Sources without requiring Canvas state.
- Keep source URLs when an asset cannot be stored locally.
- Preserve files, warnings, and manifest data needed to explain what was exported.
- Keep browser downloads and macOS file clipboard behavior explicit; never submit prompts or files to an agent automatically.

Add API coverage for Pack scope, missing local files, and generated archive contents whenever Pack behavior changes.
