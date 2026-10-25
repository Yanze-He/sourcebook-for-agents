# Release and Distribution

Sourcebook for Agents can be developed in public without exposing release credentials. A commit passing CI is not a release.

## Release scope

The public P1 is limited to **Pick -> Sources -> Pack**. It is a local-first product: the Desktop, SQLite database, media copies, and exported Packs remain on the user's computer.

Cloud sync, accounts, billing, and team workflows are not release dependencies for this repository.

## What CI produces

The release workflow builds artifacts for inspection:

- A Chromium extension ZIP.
- A macOS Desktop DMG.
- A Windows Desktop installer.
- Workflow artifacts for the extension, macOS Desktop, and Windows Desktop.

Pushing a `v*` tag, or running the workflow manually, never signs, notarizes, or publishes a GitHub Release. CI has read-only repository permissions and no signing credentials.

## Independent Agent Plugin releases

The Agent Plugin has its **own** version in `apps/agent-plugin/plugin.json` and
uses `agent-v<version>` tags. It does not inherit Desktop's version or build
number. `.github/workflows/agent-plugin.yml` produces versioned macOS arm64
and Windows x64 ZIPs plus a `.zip.sha256` file for each. This workflow uploads
CI artifacts only; it does not create a public Release. Do not attach these
unsigned CI test artifacts directly to a public Agent Plugin Release.

Before publication, test the standalone install/update guide with Desktop
present and absent, and with Codex and WorkBuddy user-level configurations.
The macOS helper must be Developer ID signed and its distribution archive
notarized; verify the resulting public ZIP and its checksum. Rebuild the
checksum after any signing or archive change. Publish both platform archives
and matching `.zip.sha256` files in a non-draft GitHub Release for the
`agent-v<version>` tag. The [Agent install guide](install-agent-plugin.md)
selects only this tag family. An Agent can then download, verify, and update
its own Plugin without a Desktop release. Changes to the Desktop bridge API
still require compatibility testing and, if needed, a Desktop update.

Desktop does not bundle an Agent Plugin. Before building Desktop, test the
bridge compatibility range against the latest accepted standalone Plugin
package. The Connect an Agent prompt must continue to point to the
version-independent install guide, which directs supported Agents to the
standalone marketplace package for installation and updates.

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

The command builds the platform-native Go service and application, applies a Developer ID signature with Hardened Runtime and timestamping, creates the DMG, submits it to Apple notarization, staples the resulting ticket, validates the result, and writes `release/macos/SHA256SUMS.txt`.

Create or edit the matching GitHub Release manually, then upload the notarized `sourcebook-desktop-installer-v<version>.dmg`, its `SHA256SUMS.txt`, and any separately verified versioned Picker or Windows artifacts.

## Release checklist

1. Confirm `main` is green in CI.
2. Test the extension and Desktop on clean macOS and Windows machines. For each Desktop installer, also test an upgrade over the prior release: open the app, click **Install Picker**, and confirm the browser opens the Chrome Web Store installation page.
3. Update `CHANGELOG.md` with user-visible changes and known limitations.
4. Choose a version tag such as `v0.1.0-beta.3`.
5. Create and push a protected version tag such as `v0.1.0-beta.3`. The release workflow uses this tag as the Desktop and installer version.
6. Let CI build and test its artifacts, then create the signed and notarized macOS artifact locally from that exact tag.
7. Verify checksums, downloads, first launch, local storage location, and extension-to-Desktop connection before manually publishing a GitHub Release. Settings reads published, non-draft Releases, so include clear release notes and the matching Desktop installer before publishing.

## Installation notes

- The macOS DMG presents **Sourcebook Desktop** beside an **Applications** shortcut. Drag the app onto Applications, eject the disk image, then open it from Applications. Sourcebook appears in the Dock; its application menu opens Sources, restarts the local service, or quits the app.
- Public macOS releases must be Developer ID signed and Apple notarized. Do not distribute an unsigned or unnotarized DMG as a public release.
- Windows artifacts remain unsigned until a separate Windows code-signing certificate is configured.
- The public Picker is installed from the Chrome Web Store. The downloadable ZIP remains available only for local development or recovery testing, and must be unzipped and loaded through `chrome://extensions` with Developer mode enabled.

## Before a public Chrome Web Store submission

- Publish the privacy policy at a stable public URL.
- Complete Chrome Web Store data-use disclosures and permission explanations.
- Confirm the downloadable build remains `cehohknopnehbkiokoffhfjepaieapan`. Chrome Web Store packages omit the manifest key and use the Store-assigned ID `pkglhngkfkjblabnhgcioindjgffgfpf`; both IDs must remain in the Desktop local API allowlist.
- Confirm that only the minimum required extension permissions are requested.

## Do not do this

Do not expose the loopback API through a reverse proxy, public tunnel, or LAN binding. It is a single-user local service, not a hosted multi-tenant API.

Do not add signing certificates, `.p12` files, Apple app-specific passwords, or notarization profiles to repository files, GitHub Actions Secrets, issue attachments, or release assets.
