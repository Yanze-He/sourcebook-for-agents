import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Sourcebook for Agents",
    description: "Pick, organize, and pack web context for AI agents.",
    version: "0.1.0",
    permissions: ["activeTab", "contextMenus", "storage"],
    host_permissions: [
      "https://*/*",
      "http://*/*",
      "http://127.0.0.1:4177/*",
      "http://localhost:4177/*"
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
    action: {
      default_title: "Sourcebook for Agents",
      default_popup: "popup.html"
    }
  }
});
