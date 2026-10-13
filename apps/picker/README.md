# Sourcebook for Agents Picker

This directory contains the Sourcebook for Agents Chrome/Chromium extension and its local Pick integration.

## Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build and start the browser-first Sourcebook Desktop. Its local API is the single data store for Pick, Sources, and Pack:

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

5. Open the local Sources:

   ```text
   http://127.0.0.1:4177/
   ```

## MVP Scope

- Pick selected web text.
- Pick visible images (PNG, JPEG, GIF, WebP). Picker automatically attempts to copy each image into the current Book; when the browser cannot read an image directly, Sourcebook tries the original source link. If the site blocks the request, the Pick remains available as a source link.
- Pick links.
- Pick lightweight webpage metadata.
- Save all picks to Sources.
- Require Sourcebook Desktop to be connected before exposing Pick controls; the popup offers refresh and Desktop download actions when the local service is unavailable.
- Pick individual, selected, or visible messages from supported AI chat pages.
- Reload the unpacked extension in Chrome after rebuilding, then refresh the source page.
