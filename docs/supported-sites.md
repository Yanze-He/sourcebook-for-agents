# Supported Sites and Limitations

## Browser support

Sourcebook for Agents currently supports Chrome and Chromium browsers. Firefox and Safari are not supported in this P1.

## Generic web Pick

On ordinary webpages, Picker can Pick selected text, links, images, video references, and a lightweight webpage card. A webpage card stores the page URL, canonical URL when available, title, site name, favicon, Open Graph thumbnail, and a short metadata description. It does not save the full webpage body.

For images, Picker attempts to save a local copy up to 20 MB. Some sites prevent this through access controls or expiring URLs; when that happens, Sourcebook keeps the source reference and reports that no local copy is available.

## Agent conversations

Picker recognizes the following web chat providers:

| Provider | Website |
| --- | --- |
| ChatGPT | `chatgpt.com` / `chat.openai.com` |
| Gemini | `gemini.google.com` |
| DeepSeek | `chat.deepseek.com` |
| Grok | `grok.com` |

On recognized pages, Picker can Pick one message, selected messages, or messages already loaded in the current page DOM. It does not automatically load earlier history, send content back to a provider, or Pick messages hidden behind pagination.

Chat pages change often. If a provider changes its page structure, use generic text Pick as a fallback and file a reproducible issue with the provider URL, browser version, and an anonymized description of the page structure.

## Intentional limitations

- No full-page snapshots, OCR, ASR, or video file downloads.
- No automated collection of login credentials, password fields, or browser-internal pages.
- No cloud sync, accounts, sharing, or team Sources apps.
- A Pack preserves local image files only when a local copy was successfully saved; video and inaccessible media remain source URLs.
