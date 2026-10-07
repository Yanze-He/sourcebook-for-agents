# Desktop Contribution Guide

Use `apps/desktop` for the local application launcher and packaging work.

- Keep macOS and Windows packages self-contained: Node runtime, service files, and built Sources assets travel together.
- Keep the launcher responsible for local paths, process lifecycle, and opening Sources in the default browser.
- Keep Book and Source data logic in `apps/sources/server`, not in the launcher.
- Validate both package scripts after changing bundled paths or environment variables.
