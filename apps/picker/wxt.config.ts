import { defineConfig } from "wxt";

// Chrome Web Store assigns and retains the production extension ID. Store ZIPs
// must omit this development key; unpacked builds keep it for stable local API
// allow-listing. `npm run zip:store` sets this flag for the upload package.
const isChromeWebStoreBuild = process.env.SOURCEBOOK_PICKER_STORE_BUILD === "1";

export default defineConfig({
  manifest: {
    name: "Picker for Agent",
    description: "Pick web context and save it to Sourcebook for agents.",
    // Keep Chrome's manifest version aligned with package.json so an installed
    // Picker is actually updated instead of continuing to run an old popup.
    version: "0.1.3",
    // A public key gives unpacked builds a stable Chrome extension ID. The
    // production Store package deliberately omits it so Chrome keeps the ID
    // assigned to the Store listing.
    ...(isChromeWebStoreBuild
      ? {}
      : {
          key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjqCkqLDFC1uYPz2bE7ChFTX8PQwRnibxwjIxrOO9U1pdQRAv+xGZ1OWc512+VnmusG+sN5uJizh4Aq5V9SXQQFph8nuL4nCsGbzVFzUcMGUbdQ+ObJKPlP3BOQxKCZ07zipe+iy/UXs8AH5V7PC3iOZBBUX8DRB1wqqa4ZcCxJAHzhJbvHd9jn2WTmp2l+DtqxM9fgbp79gWrqYeOzkeLrMS1tAQam+9CQqtA7HxRr+4lgvxMvXt0npijGLz/xmUgHquqRet7HcGvMkBCYKdibCuaUjgVdTolgsclBO9XBSmTYWUXZJ/YeOlbPYiHUoA5T5EVh9lqFCbUw3zwdhh/QIDAQAB"
        }),
    permissions: ["activeTab", "alarms", "contextMenus", "storage"],
    host_permissions: [
      "https://*/*",
      "http://*/*",
      "http://127.0.0.1:4177/*",
      "http://localhost:4177/*",
      "http://127.0.0.1:27124/*",
      "http://localhost:27124/*"
    ],
    web_accessible_resources: [
      {
        resources: ["sourcebook-mark.png"],
        matches: ["<all_urls>"]
      }
    ],
    commands: {
      "pick-current": {
        suggested_key: {
          default: "Ctrl+Shift+P",
          mac: "Command+Shift+P"
        },
        description: "Pick the current selection or page"
      }
    },
    icons: {
      16: "sourcebook-icon-16.png",
      32: "sourcebook-icon-32.png",
      48: "sourcebook-icon-48.png",
      128: "sourcebook-icon-128.png"
    },
    action: {
      default_icon: {
        16: "sourcebook-icon-16.png",
        32: "sourcebook-icon-32.png",
        48: "sourcebook-icon-48.png"
      },
      default_title: "Picker for Agent",
      default_popup: "popup.html"
    }
  }
});
