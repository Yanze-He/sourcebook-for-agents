# Desktop Contribution Guide

Use `apps/desktop` for the local application launcher and packaging work.

- Keep macOS and Windows packages self-contained: bundle the Go service binary built for the target platform, never a Node runtime.
- Keep the launcher responsible for local paths, process lifecycle, and opening Sources in the default browser.
- Keep Book and Source data logic in `apps/service-go`, not in the launcher.
- Validate both package scripts after changing bundled paths or environment variables.
