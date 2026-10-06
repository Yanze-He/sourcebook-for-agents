# Companion Contributions

Use `apps/companion` for browser-first desktop distribution work.

- The Companion owns process startup, loopback-only service lifecycle, the browser launch, platform data directories, and installer assembly.
- Do not move web UI into Electron or require a global Node installation.
- Keep macOS and Windows packages self-contained: Node runtime, service files, and built workspace assets travel together.
- Never bind to non-loopback addresses or place signing credentials in source control.

Run `npm --prefix apps/companion test` and `npm --prefix apps/companion run build`. Platform package scripts must be run on their target operating system.
