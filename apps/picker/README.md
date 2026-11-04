# Sourcebook Picker

This directory contains the Sourcebook Picker Chrome/Chromium extension and its local Pick integration.

## Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start one of the two local Sourcebook connection targets:

   - **Sourcebook for Obsidian** in the current Vault. Open the plugin's
     “连接 Picker” panel, copy its pairing code, then choose Obsidian in
     Picker and connect with that code.
   - **Sourcebook Desktop** on this computer. Start the app, then choose
     Desktop App in Picker and click Connect.

   For Desktop development, build and start the local app:

   ```bash
   cd ../..
   npm run build
   npm run dev:desktop
   ```

3. In a separate terminal, from this Picker directory, build the extension:

   ```bash
   npm run build
   ```

4. In Chrome's extension page, choose **Load unpacked** once and select
   `apps/picker/artifacts/unpacked`. This is the fixed local test folder.
   Every subsequent `npm run build` replaces its contents in place, so the
   extension can be updated with Chrome's **Reload** button instead of loading
   a new folder each time.

5. Create a versioned local-test ZIP only when one needs to be handed off:

   ```bash
   npm run package:local -- build.005
   ```

   The ZIP is saved under `artifacts/local-test/` using the existing
   `sourcebook-picker-v<version>-build.NNN.zip` convention. It never replaces
   an earlier candidate.

6. For Desktop development, open the connected Sourcebook and choose a Book:

   ```text
   http://127.0.0.1:4177/
   ```

   For Obsidian, open the Sourcebook view in the paired Vault instead.

## MVP Scope

- Pick selected web text.
- Pick visible images (PNG, JPEG, GIF, WebP). Picker automatically attempts to copy each image into the current Book; when the browser cannot read an image directly, Sourcebook tries the original source link. If the site blocks the request, the Pick remains available as a source link.
- Pick links.
- Pick lightweight webpage metadata.
- Save all Picks to the selected Book in the connected Sourcebook.
- Connect to either the current Vault's Sourcebook for Obsidian plugin or the
  local Sourcebook Desktop app. Pairing data remains on the device; no account
  or cloud sync is required.
- Pick individual, selected, or visible messages from supported AI chat pages.
- Reload the unpacked extension in Chrome after rebuilding, then refresh the source page.
