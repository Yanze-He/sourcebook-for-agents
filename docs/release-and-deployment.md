# Release and Distribution

Sourcebook for Agents can be developed in public without exposing release credentials. A commit passing CI is not a release.

## Release scope

The public P1 is limited to **Pick -> Sources -> Pack**. It is a local-first product: the Desktop, SQLite database, media copies, and exported Packs remain on the user's computer.

Cloud sync, accounts, billing, teams, and any future canvas product are separate products and are not release dependencies for this repository.

## What CI produces

The release workflow builds artifacts for inspection:

- A Chromium extension ZIP.
- A macOS Desktop DMG.
- A Windows Desktop installer.
- Workflow artifacts for the extension, macOS Desktop, and Windows Desktop.

Pushing a `v*` tag, or running the workflow manually, never signs, notarizes, or publishes a GitHub Release. CI has read-only repository permissions and no signing credentials.

## Local macOS signing and notarization

Only a maintainer-controlled Mac signs and notarizes macOS releases. Keep the Developer ID private key, the `.p12` backup password, and Apple notarization credentials out of the repository, shell history, and GitHub Actions.

### One-time setup

1. Import the Developer ID Application `.p12` into the login keychain using Keychain Access.
2. Create an Apple app-specific password for notarization and save it to a local Keychain profile:

   ```bash
   xcrun notarytool store-credentials sourcebook-notary \
     --apple-id "your-apple-id@example.com" \
     --team-id "YOUR_TEAM_ID" \
     --password "app-specific-password"
   ```

3. Find the signing identity with `security find-identity -v -p codesigning` and export it only for the release command.

### Create a macOS release

Run from a clean checkout at an exact version tag:

```bash
export MACOS_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export SOURCEBOOK_NOTARY_PROFILE="sourcebook-notary"
npm run release:macos:local
```

The command builds the application, applies a Developer ID signature with Hardened Runtime and timestamping, creates the DMG, submits it to Apple notarization, staples the resulting ticket, validates the result, and writes `release/macos/SHA256SUMS.txt`.

Create or edit the matching GitHub Release manually, then upload the notarized `Sourcebook-Desktop.dmg`, its `SHA256SUMS.txt`, and any separately verified extension or Windows artifacts.

## Release checklist

1. Confirm `main` is green in CI.
2. Test the extension and Desktop on clean macOS and Windows machines.
3. Update `CHANGELOG.md` with user-visible changes and known limitations.
4. Choose a version tag such as `v0.1.0-alpha.1`.
5. Create and push a protected version tag such as `v0.1.0-alpha.1`.
6. Let CI build and test its artifacts, then create the signed and notarized macOS artifact locally from that exact tag.
7. Verify checksums, downloads, first launch, local storage location, and extension-to-Desktop connection before manually publishing a GitHub Release.

## Installation notes

- The macOS DMG contains a standard **Applications** shortcut. Drag **Sourcebook Desktop** to it before ejecting the disk image.
- Public macOS releases must be Developer ID signed and Apple notarized. Do not distribute an unsigned or unnotarized DMG as a public release.
- Windows artifacts remain unsigned until a separate Windows code-signing certificate is configured.
- The Chromium extension ZIP must be unzipped and loaded through `chrome://extensions` with Developer mode enabled.

## Before a public Chrome Web Store submission

- Publish the privacy policy at a stable public URL.
- Complete Chrome Web Store data-use disclosures and permission explanations.
- Ship and test the final extension-to-Desktop pairing flow.
- Confirm that only the minimum required extension permissions are requested.

## Do not do this

Do not expose the loopback API through a reverse proxy, public tunnel, or LAN binding. It is a single-user local service, not a hosted multi-tenant API.

Do not add signing certificates, `.p12` files, Apple app-specific passwords, or notarization profiles to repository files, GitHub Actions Secrets, issue attachments, or release assets.
