# Sources Contribution Guide

Use `apps/sources` for the Sources interface and local service.

- Use product copy `Sources` in English and `素材` in Chinese.
- Treat a Book as an isolated local collection: all requests must carry or resolve a Book ID.
- Keep local file copying, storage state, backups, and transfer operations in the service layer.
- Keep Pack preparation separate from rendering and selection UI.
