# Release and Distribution

Sourcebook for Agents is currently a private, early-alpha repository. A commit passing CI is not a public release.

## Release scope

The public P1 is limited to **Pick -> Sources -> Pack**. It is a local-first product: the Desktop, SQLite database, media copies, and exported Packs remain on the user's computer.

Cloud sync, accounts, billing, teams, and any future canvas product are separate products and are not release dependencies for this repository.

## What a release produces

The release workflow can build:

- A Chromium extension ZIP.
- A macOS Desktop DMG.
- A Windows Desktop installer.
- SHA-256 checksums and generated release notes.

Pushing a `v*` tag builds the artifacts and creates a prerelease in this private repository. The workflow can also be run manually for an internal build; set **Publish** to create or refresh its private GitHub Release.

## Release checklist

1. Confirm `main` is green in CI.
2. Test the extension and Desktop on clean macOS and Windows machines.
3. Update `CHANGELOG.md` with user-visible changes and known limitations.
4. Choose a version tag such as `v0.1.0-alpha.1`.
5. Create and push a version tag such as `v0.1.0-alpha.1`, or run **Build release artifacts** manually. Keep signing disabled only for internal testing.
6. For externally distributed installers, configure Apple notarization and Windows code-signing secrets, then run again with signing enabled.
7. Verify checksums, downloads, first launch, local storage location, and extension-to-Desktop connection before publishing a GitHub Release.

## Before a public Chrome Web Store submission

- Publish the privacy policy at a stable public URL.
- Complete Chrome Web Store data-use disclosures and permission explanations.
- Ship and test the final extension-to-Desktop pairing flow.
- Confirm that only the minimum required extension permissions are requested.

## Do not do this

Do not expose the loopback API through a reverse proxy, public tunnel, or LAN binding. It is a single-user local service, not a hosted multi-tenant API.
