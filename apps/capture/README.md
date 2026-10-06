# Sourcebook for Agents Picker

This workspace contains the Sourcebook for Agents Chrome/Chromium extension and its local Pick integration.

## Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build and start the browser-first Sourcebook Companion. Its local API is the single data store for Pick, Sources, and Pack:

   ```bash
   cd ../..
   npm run build
   npm run dev:companion
   ```

3. In a separate terminal, from this Capture directory, build the extension:

   ```bash
   npm run build
   ```

4. Load the generated extension from `.output/chrome-mv3` in Chrome's extension page.

5. Open the local Inbox:

   ```text
   http://127.0.0.1:4177/
   ```

## MVP Scope

- Pick selected web text.
- Pick visible images (PNG, JPEG, GIF, WebP); the main app downloads a local copy, up to 20 MB. Failed downloads show an error and can be retried by picking again.
- Pick links.
- Pick lightweight webpage metadata.
- Save all picks to Global Inbox.
- Queue picks in extension storage while the Companion is unavailable.
- Capture individual, selected, or visible messages from supported AI chat pages.
- Reload the unpacked extension in Chrome after rebuilding, then refresh the source page.
