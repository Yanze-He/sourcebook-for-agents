# Sources Contributions

Use `apps/workspace/src` for Sources work.

- Sources is the durable list of captured material, not a project container.
- Keep preview, filtering, notes, metadata, local-file status, and source links usable without Canvas.
- Use product copy `Sources` in English and `素材` in Chinese. Keep internal `inbox` identifiers unchanged for compatibility.
- Do not require Board or Project IDs for standard Sources actions.

Validate Sources changes with `npm --prefix apps/workspace test` and `npm --prefix apps/workspace run build`.
