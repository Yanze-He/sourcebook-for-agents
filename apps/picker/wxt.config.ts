import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Picker for Agent",
    description: "Pick web context and save it to Sourcebook for agents.",
    version: "0.1.0",
    permissions: ["activeTab", "alarms", "contextMenus", "storage"],
    host_permissions: [
      "https://*/*",
      "http://*/*",
      "http://127.0.0.1:4177/*",
      "http://localhost:4177/*"
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
