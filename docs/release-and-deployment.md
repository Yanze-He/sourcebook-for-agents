# Release and Distribution

Sourcebook for Agents can be developed in public without exposing release credentials. A commit passing CI is not a release.

## Release scope

The public P1 is limited to **Pick -> Sources -> Pack**. It is a local-first product: the Desktop, SQLite database, media copies, and exported Packs remain on the user's computer.

Cloud sync, accounts, billing, and team workflows are not release dependencies for this repository.

## What CI produces

The release workflow builds selected artifacts for inspection:

- A Chromium extension ZIP.
- A macOS Desktop DMG.
- A Windows Desktop installer.
- Workflow artifacts for the extension, macOS Desktop, and Windows Desktop.

Run the workflow manually with a target version, platform, and `mac.NNN` or `win.NNN` candidate label. Only that platform is built. Picker is built only when its own code or manifest changed. CI never signs, notarizes, or publishes a GitHub Release; it has read-only repository permissions and no signing credentials.

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

After the local macOS candidate has been installed and accepted, run from its clean, exact source commit. The candidate metadata and unsigned app archive are produced by `scripts/prepare-candidate-artifact.mjs` from the locally built installer and app. The signing command verifies their checksums, version, build label, commit, and source tree before using the accepted app:

```bash
export MACOS_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export SOURCEBOOK_NOTARY_PROFILE="sourcebook-notary"
export SOURCEBOOK_BUILD="mac.NNN"
export SOURCEBOOK_CANDIDATE_METADATA="/path/to/candidate/build-info.json"
npm run release:macos:local
```

The command signs the accepted app with Hardened Runtime and timestamping, creates the DMG, submits it to Apple notarization, staples the resulting ticket, validates the result, and writes `release/macos/SHA256SUMS.txt` and `release/macos/sourcebook-release-manifest.json`. The manifest records the platform revision used by the updater.

Prepare the matching GitHub Release as a draft with the notarized `sourcebook-desktop-installer-v<version>.dmg`, checksums, manifest, and any separately verified Picker or Windows artifacts. Publishing requires a separate final confirmation. A platform-only release must state which platform has an installer.

## Release checklist

1. Confirm `main` is green in CI.
2. Test every platform included in this release, including an upgrade over the prior release. Keep each accepted candidate's source commit, tree, and checksum in the private release registry.
3. Update `CHANGELOG.md` with user-visible changes and known limitations.
4. Choose a version tag such as `v0.1.0-beta.3`.
5. Build the macOS candidate locally and hand it to the user. If Windows is included, dispatch the Windows-only CI candidate from the same accepted source tree and hand it to the user separately.
6. After acceptance, sign and notarize the exact accepted macOS app. Prepare a draft GitHub Release with only verified platform assets and a release manifest.
7. Get final publication confirmation, then publish and verify the tag, checksums, downloads, first launch, and update detection. Settings reads published, non-draft Releases and considers only installers for the current platform.

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
