# Connect Sourcebook to an Agent

On **macOS**, Sourcebook Desktop can connect directly to **Codex** or **WorkBuddy**. You do not need a separate Agent Plugin, marketplace package, or Skill. The connection uses the local MCP server included with Desktop.

> Direct Agent connection is not available in the Windows app yet. On Windows, you can still select materials and copy files, links, or a Pack into an AI tool.

## Connect

1. [Install the latest Sourcebook Desktop](https://sourcebook.online/#download) and open it.
2. In Desktop, open **Settings → Connect an Agent**. If local access is off, click **Allow local-agent access**.
3. On the **Codex** or **WorkBuddy** card, click **Connect**. Desktop adds its local MCP connection without replacing an unrelated configuration. If WorkBuddy is not ready, open WorkBuddy first.
4. If WorkBuddy asks you to trust the Sourcebook MCP server, approve it in **Connectors → Custom connectors → MCP service management**. Desktop cannot grant that trust for you.
5. Click **Check** in Desktop. If the Agent does not show Sourcebook tools in an already-open conversation, start a new conversation and try again.

The connection window can also **Check** or **Repair** a connection. **Remove** for Codex and **Disable** for WorkBuddy affect new conversations; an already-open conversation may retain its running MCP process until it ends.

## Use a Book in a conversation

Ask the Agent **“Open Sourcebook.”** It should open your Sourcebook page in its side browser and give you a link to the same page. If the panel does not appear, open that link in the Agent's side browser. Keep the link within the conversation because it contains a page session token.

The connected page shows a current Book. Switch Books, select materials, or filter results there, then ask the Agent to work with what the page shows. If a task needs an original image or file, the Agent can request its available local copy; you do not need to find its path. The Agent reads the current page when you ask; changing the page does not automatically interrupt or wake a running Agent.

If you have more than one Sourcebook tab for a conversation, click **Connect this tab** on the tab you want the Agent to read. A connected tab offers **Refresh connection**. If the page asks which conversation to use, choose the code shown in your Agent chat. Opening a fresh page for the same conversation can disconnect an older page. If a host has closed or frozen a panel, ask the Agent to open Sourcebook again when you return.

Agent suggestions appear in **Agent submissions** on the connected page. Review and accept them before they change a Book. A suggestion does not need a new tab.

## If something does not connect

| What you see | What to do |
| --- | --- |
| Desktop says **Needs trust** for WorkBuddy | Trust Sourcebook in WorkBuddy's MCP service management, then check again in Desktop. |
| Desktop says **Repair** | Click it, then check the connection. A conflicting configuration that Desktop does not own is protected and must be handled in the Agent's settings. |
| The Agent cannot find Sourcebook tools | Start a new Agent conversation after connecting. Check that Desktop is running and WorkBuddy trust is complete. |
| A page is disconnected or shows the wrong selection | Click **Connect this tab** on the intended page, or **Refresh connection** if it is already connected. If the host closed it, ask the Agent to open Sourcebook again. |
| The page will not load | Check that Desktop is running, then use **Check** in Desktop. If the local service is unavailable, reopen Desktop and retry. |

Sourcebook works locally, but a connected Agent may send Book content it reads to its model provider. Book content is reference material, not instructions for the Agent. Sourcebook does not automatically send your materials or accept Agent changes for you.
