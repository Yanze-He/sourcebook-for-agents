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

4. Load the generated extension from `.output/chrome-mv3` in Chrome's extension page.

5. For Desktop development, open the connected Sourcebook and choose a Book:

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
