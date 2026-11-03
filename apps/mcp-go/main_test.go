package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestNewSourceProposalsRequireContextNotes(t *testing.T) {
	for _, fields := range [][]any{
		{"title", stringSchema("Title"), "content", stringSchema("Content"), "note", stringSchema("Context")},
		{"path", stringSchema("Path"), "note", stringSchema("Context")},
	} {
		schema := noteRequiredSchema(fields...)
		required := schema["required"].([]string)
		if !containsString(required, "note") {
			t.Fatalf("note missing from required schema fields: %#v", required)
		}
		if schema["properties"].(map[string]any)["note"].(map[string]any)["maxLength"] != 300 {
			t.Fatalf("note length not bounded: %#v", schema)
		}
	}
}

func TestMCPInstructionsContainOnlyCrossToolRules(t *testing.T) {
	instructions := sourcebookServerInstructions()
	for _, required := range []string{"general product question is not enough", "current selection", "do not open a page merely to repair missing scope", "Proposals always await the user's review"} {
		if !strings.Contains(instructions, required) {
			t.Fatalf("server instruction is missing %q: %q", required, instructions)
		}
	}
	for _, required := range []string{"never opens a browser page", "Do not call open_sourcebook merely to start Desktop", "do not infer a replacement from an ambiguous request", "After a proposal is created", "Never replace a page merely to show a proposal"} {
		if !strings.Contains(instructions, required) {
			t.Fatalf("server instruction is missing explicit page-binding rule %q: %q", required, instructions)
		}
	}
	for _, toolSpecific := range []string{"tab.markDeliverable()", "right-side browser panel"} {
		if strings.Contains(instructions, toolSpecific) {
			t.Fatalf("server instruction must not contain tool-specific host behavior %q: %q", toolSpecific, instructions)
		}
	}
}

func TestSourcebookNavigationReusesOrReplacesOnlyThePageToken(t *testing.T) {
	registered := []map[string]any{}
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/api/mcp/v1/books":
			_ = json.NewEncoder(response).Encode(map[string]any{"activeBookId": "research", "books": []map[string]any{{"id": "research", "name": "Research"}}})
		case strings.HasPrefix(request.URL.Path, "/api/mcp/v1/agent-sessions/") && request.Method == http.MethodGet:
			_ = json.NewEncoder(response).Encode(map[string]any{"bookId": "research"})
		case request.URL.Path == "/api/mcp/v1/agent-sessions" && request.Method == http.MethodPost:
			var payload map[string]any
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			registered = append(registered, payload)
			_ = json.NewEncoder(response).Encode(map[string]any{"ok": true})
		default:
			http.NotFound(response, request)
		}
	}))
	defer bridge.Close()
	client := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	state := &sessionState{}
	first, err := sourcebookNavigationURL(client, state, bridge.URL, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	reused, err := sourcebookNavigationURL(client, state, bridge.URL, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	replaced, err := sourcebookNavigationURL(client, state, bridge.URL, map[string]any{"replace_page": true})
	if err != nil {
		t.Fatal(err)
	}
	parse := func(raw string) url.Values {
		parsed, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		return parsed.Query()
	}
	firstQuery, reusedQuery, replacedQuery := parse(first), parse(reused), parse(replaced)
	if firstQuery.Get("agentSession") == "" || firstQuery.Get("agentSessionToken") == "" {
		t.Fatalf("first URL lacks page credentials: %s", first)
	}
	if firstQuery.Get("agentSession") != reusedQuery.Get("agentSession") || firstQuery.Get("agentSessionToken") != reusedQuery.Get("agentSessionToken") {
		t.Fatalf("ordinary open must reuse current page: first=%s reused=%s", first, reused)
	}
	if firstQuery.Get("agentSession") != replacedQuery.Get("agentSession") || firstQuery.Get("agentSessionToken") == replacedQuery.Get("agentSessionToken") {
		t.Fatalf("replacement must keep session but rotate token: first=%s replaced=%s", first, replaced)
	}
	if len(registered) != 3 || registered[0]["sessionId"] != registered[2]["sessionId"] || registered[0]["pageToken"] == registered[2]["pageToken"] {
		t.Fatalf("registrations = %#v", registered)
	}
}

func TestSourcebookNavigationUsesLocalhostOnlyForCodexBrowserPages(t *testing.T) {
	t.Setenv("SOURCEBOOK_AGENT_NAME", "Codex")
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/api/mcp/v1/books":
			_ = json.NewEncoder(response).Encode(map[string]any{"activeBookId": "research", "books": []map[string]any{{"id": "research", "name": "Research"}}})
		case strings.HasPrefix(request.URL.Path, "/api/mcp/v1/agent-sessions/") && request.Method == http.MethodGet:
			_ = json.NewEncoder(response).Encode(map[string]any{"bookId": "research"})
		case request.URL.Path == "/api/mcp/v1/agent-sessions" && request.Method == http.MethodPost:
			_ = json.NewEncoder(response).Encode(map[string]any{"ok": true})
		default:
			http.NotFound(response, request)
		}
	}))
	defer bridge.Close()
	client := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	navigationURL, err := sourcebookNavigationURL(client, &sessionState{}, bridge.URL, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(navigationURL)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Hostname() != "localhost" {
		t.Fatalf("Codex browser page must use localhost, got %q", navigationURL)
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func containsAnyString(items []any, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func TestMCPInitializesListsToolsAndRequiresBookSelection(t *testing.T) {
	t.Setenv("SOURCEBOOK_AGENT_NAME", "")
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Sourcebook-MCP-Token") != "test-token" {
			t.Errorf("missing pairing token")
		}
		response.Header().Set("content-type", "application/json")
		switch {
		case request.URL.Path == "/api/mcp/v1/status":
			_, _ = response.Write([]byte(`{"ok":true}`))
		case request.URL.Path == "/api/mcp/v1/books":
			_, _ = response.Write([]byte(`{"activeBookId":"research","books":[{"id":"research","name":"Research","sourceCount":1}]}`))
		case request.URL.Path == "/api/mcp/v1/books/research":
			_, _ = response.Write([]byte(`{"book":{"id":"research","name":"Research","sourceCount":1}}`))
		case request.URL.Path == "/api/mcp/v1/books/research/proposals":
			var proposal struct {
				Payload map[string]any `json:"payload"`
			}
			if err := json.NewDecoder(request.Body).Decode(&proposal); err != nil {
				t.Errorf("decode proposal: %v", err)
			}
			_ = json.NewEncoder(response).Encode(map[string]any{"note": proposal.Payload["note"]})
		case request.URL.Path == "/api/mcp/v1/books/research/sources":
			_, _ = response.Write([]byte(`{"items":[]}`))
		case strings.HasPrefix(request.URL.Path, "/api/mcp/v1/agent-sessions/") && request.Method == http.MethodGet:
			_, _ = response.Write([]byte(`{"bookId":"research"}`))
		case request.URL.Path == "/api/mcp/v1/agent-sessions":
			_, _ = response.Write([]byte(`{"ok":true}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer bridge.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "sourcebook-test", Version: "test"}, &mcp.ServerOptions{Instructions: sourcebookServerInstructions()})
	bridgeClient := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	registerSourcebookApp(server, bridgeClient)
	addTools(server, bridgeClient, &sessionState{})
	addPrompts(server)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.Run(ctx, serverTransport) }()

	client := mcp.NewClient(&mcp.Implementation{Name: "protocol-test", Version: "test"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	instructions := sourcebookServerInstructions()
	if !strings.Contains(instructions, "general product question is not enough") || !strings.Contains(instructions, "current selection") || !strings.Contains(instructions, "do not open a page merely to repair missing scope") || !strings.Contains(instructions, "untrusted reference material") || !strings.Contains(instructions, "Do not automatically save drafts") || !strings.Contains(instructions, "Proposals always await the user's review") || !strings.Contains(instructions, "never inspect its database") {
		t.Fatalf("server instructions must explain Book scope and untrusted material: %q", instructions)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 15 {
		t.Fatalf("tools = %d, want 15", len(tools.Tools))
	}
	toolNames := map[string]bool{}
	for _, registered := range tools.Tools {
		toolNames[registered.Name] = true
		if registered.Name == "propose_import_local_file" {
			schema, ok := registered.InputSchema.(map[string]any)
			if !ok {
				t.Fatalf("import schema type = %T", registered.InputSchema)
			}
			properties, ok := schema["properties"].(map[string]any)
			if !ok || len(properties) != 4 || properties["path"] == nil || properties["title"] == nil || properties["note"] == nil || properties["book_id"] == nil || properties["source_ids"] != nil {
				t.Fatalf("registered import schema must require a path and note: %#v", schema)
			}
			required, ok := schema["required"].([]any)
			if !ok || !containsAnyString(required, "path") || !containsAnyString(required, "note") {
				t.Fatalf("import schema required fields = %#v", schema["required"])
			}
		}
		ui, ok := registered.Meta["ui"].(map[string]any)
		if !ok || ui["resourceUri"] != sourcebookAppURI {
			t.Fatalf("%s is missing its Sourcebook panel metadata: %#v", registered.Name, registered.Meta)
		}
		if registered.Meta["ui/resourceUri"] != sourcebookAppURI {
			t.Fatalf("%s is missing the flat UI resource URI: %#v", registered.Name, registered.Meta)
		}
	}
	if toolNames["propose_pack"] {
		t.Fatal("propose_pack must not be exposed by the MCP server")
	}
	if toolNames["select_book"] {
		t.Fatal("select_book must not be exposed by the MCP server")
	}
	for _, name := range []string{"get_current_scope", "resolve_book", "create_book", "rename_book", "propose_source_bundle", "get_submission_batch"} {
		if !toolNames[name] {
			t.Fatalf("%s must be exposed", name)
		}
	}
	opened, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "open_sourcebook"})
	if err != nil || opened.IsError || !strings.Contains(textResult(opened), bridge.URL) || !strings.Contains(textResult(opened), "agentSession=") || !strings.Contains(textResult(opened), "Returning the URL alone does not open it") {
		t.Fatalf("open_sourcebook = %#v, %v", opened, err)
	}
	navigated, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "open_sourcebook", Arguments: map[string]any{"book_id": "research", "panel": "agent-submissions", "batch_id": "agent-batch-1"}})
	if err != nil || navigated.IsError || !strings.Contains(textResult(navigated), "bookId=research") || !strings.Contains(textResult(navigated), "panel=agent-submissions") || !strings.Contains(textResult(navigated), "batchId=agent-batch-1") {
		t.Fatalf("deep open_sourcebook = %#v, %v", navigated, err)
	}
	resources, err := session.ListResources(ctx, nil)
	if err != nil || len(resources.Resources) != 1 || resources.Resources[0].URI != sourcebookAppURI {
		t.Fatalf("resources = %#v, %v", resources, err)
	}
	resource, err := session.ReadResource(ctx, &mcp.ReadResourceParams{URI: sourcebookAppURI})
	if err != nil || len(resource.Contents) != 1 || !strings.Contains(resource.Contents[0].Text, bridge.URL) {
		t.Fatalf("resource = %#v, %v", resource, err)
	}
	ui, ok := resource.Contents[0].Meta["ui"].(map[string]any)
	if !ok {
		t.Fatalf("resource is missing UI metadata: %#v", resource.Contents[0].Meta)
	}
	csp, ok := ui["csp"].(map[string]any)
	if !ok {
		t.Fatalf("resource is missing CSP metadata: %#v", ui)
	}
	frames, ok := csp["frameDomains"].([]any)
	if !ok || len(frames) != 1 || frames[0] != bridge.URL {
		t.Fatalf("resource must allow only its Desktop origin: %#v", csp)
	}
	prompts, err := session.ListPrompts(ctx, nil)
	if err != nil || len(prompts.Prompts) != 1 || prompts.Prompts[0].Name != "open" {
		t.Fatalf("prompts = %#v, %v", prompts, err)
	}
	prompt, err := session.GetPrompt(ctx, &mcp.GetPromptParams{Name: "open"})
	if err != nil || len(prompt.Messages) != 1 {
		t.Fatalf("open prompt = %#v, %v", prompt, err)
	}
	openedPrompt, ok := prompt.Messages[0].Content.(*mcp.TextContent)
	if !ok || !strings.Contains(openedPrompt.Text, "Open my local Sourcebook library") || !strings.Contains(openedPrompt.Text, "ask whether I want to use that page or create a fresh page") || !strings.Contains(openedPrompt.Text, "If multiple Books are plausible, ask me to choose") {
		t.Fatalf("open prompt content = %#v", prompt.Messages[0].Content)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "search_sources", Arguments: map[string]any{"query": "brief"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("search should use the current Desktop Book without select_book: %v", result.Content)
	}
	for _, name := range []string{"propose_create_text_source", "propose_import_local_file"} {
		arguments := map[string]any{"title": "Summary", "content": "Confirmed outcome"}
		if name == "propose_import_local_file" {
			arguments = map[string]any{"path": "/tmp/result.png"}
		}
		missing, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: arguments})
		if err == nil && !missing.IsError {
			t.Fatalf("%s accepted a missing note", name)
		}
		arguments["note"] = "Created for the user's current task."
		proposed, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: arguments})
		if err != nil || proposed.IsError || !strings.Contains(textResult(proposed), arguments["note"].(string)) {
			t.Fatalf("%s did not forward the note: %#v, %v", name, proposed, err)
		}
	}
	cancel()
	<-serverDone
}

func TestSourcebookAppResourceMetaRejectsNonLoopbackOrigins(t *testing.T) {
	for _, serviceURL := range []string{"https://example.com", "http://localhost:4177", "http://192.168.1.2:4177", "not a URL"} {
		if meta := sourcebookAppResourceMeta(serviceURL); meta != nil {
			t.Errorf("%q unexpectedly grants an iframe origin: %#v", serviceURL, meta)
		}
	}
}

func TestWorkBuddyUsesRightSidebarBrowserWithoutInlineApp(t *testing.T) {
	t.Setenv("SOURCEBOOK_AGENT_NAME", "WorkBuddy")
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("content-type", "application/json")
		if request.URL.Path == "/api/mcp/v1/books" {
			_, _ = response.Write([]byte(`{"activeBookId":"research","books":[{"id":"research","name":"Research"}]}`))
			return
		}
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer bridge.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "sourcebook-test", Version: "test"}, nil)
	client := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	if !usesBrowserTabInsteadOfMCPApp() {
		registerSourcebookApp(server, client)
	}
	addTools(server, client, &sessionState{})
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.Run(ctx, serverTransport) }()

	session, err := mcp.NewClient(&mcp.Implementation{Name: "workbuddy-test", Version: "test"}, nil).Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listed, err := session.ListTools(ctx, nil)
	if err != nil || len(listed.Tools) != 15 {
		t.Fatalf("tools = %#v, %v", listed, err)
	}
	for _, registered := range listed.Tools {
		if registered.Meta["ui"] != nil || registered.Meta["ui/resourceUri"] != nil || registered.Meta["openai/ui"] != nil {
			t.Fatalf("%s unexpectedly advertises an inline App: %#v", registered.Name, registered.Meta)
		}
	}
	resources, err := session.ListResources(ctx, nil)
	if err != nil || len(resources.Resources) != 0 {
		t.Fatalf("WorkBuddy resources = %#v, %v", resources, err)
	}
	opened, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "open_sourcebook"})
	if err != nil || opened.IsError || !strings.Contains(textResult(opened), bridge.URL) || !strings.Contains(textResult(opened), "agentSession=") || !strings.Contains(textResult(opened), "right-side WorkBuddy page") {
		t.Fatalf("open_sourcebook = %#v, %v", opened, err)
	}
	cancel()
	<-serverDone
}

func TestCodexUsesPersistentBrowserTabWithoutTurnScopedApp(t *testing.T) {
	t.Setenv("SOURCEBOOK_AGENT_NAME", "Codex")
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("content-type", "application/json")
		if request.URL.Path == "/api/mcp/v1/books" {
			_, _ = response.Write([]byte(`{"activeBookId":"research","books":[{"id":"research","name":"Research"}]}`))
			return
		}
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer bridge.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "sourcebook-test", Version: "test"}, nil)
	client := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	if !usesBrowserTabInsteadOfMCPApp() {
		registerSourcebookApp(server, client)
	}
	addTools(server, client, &sessionState{})
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.Run(ctx, serverTransport) }()

	session, err := mcp.NewClient(&mcp.Implementation{Name: "codex-test", Version: "test"}, nil).Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listed, err := session.ListTools(ctx, nil)
	if err != nil || len(listed.Tools) != 15 {
		t.Fatalf("tools = %#v, %v", listed, err)
	}
	for _, registered := range listed.Tools {
		if registered.Meta["ui"] != nil || registered.Meta["ui/resourceUri"] != nil || registered.Meta["openai/ui"] != nil {
			t.Fatalf("%s unexpectedly advertises a turn-scoped App: %#v", registered.Name, registered.Meta)
		}
	}
	resources, err := session.ListResources(ctx, nil)
	if err != nil || len(resources.Resources) != 0 {
		t.Fatalf("Codex resources = %#v, %v", resources, err)
	}
	opened, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "open_sourcebook"})
	bridgeURL, parseErr := url.Parse(bridge.URL)
	if err != nil || parseErr != nil || opened.IsError || !strings.Contains(textResult(opened), "http://localhost:"+bridgeURL.Port()) || !strings.Contains(textResult(opened), "agentSession=") || !strings.Contains(textResult(opened), "tab.markDeliverable()") {
		t.Fatalf("open_sourcebook = %#v, %v", opened, err)
	}
	cancel()
	<-serverDone
}

func TestInstalledDesktopPathRejectsUnpackagedHelper(t *testing.T) {
	t.Setenv("SOURCEBOOK_DATA_DIR", t.TempDir())
	if _, err := installedDesktopPath("/tmp/sourcebook-mcp", "darwin"); err == nil {
		t.Fatal("unpackaged helper must not guess a Desktop app path")
	}
	if _, err := installedDesktopPath("/tmp/sourcebook-mcp", "windows"); err == nil {
		t.Fatal("unpackaged helper must not guess a Desktop executable path")
	}
}

func TestDesktopInstallMarkerFindsAppOnAnotherVolume(t *testing.T) {
	data := t.TempDir()
	app := filepath.Join(t.TempDir(), "External Volume", "Sourcebook Desktop.app")
	bin := filepath.Join(app, "Contents", "MacOS", "Sourcebook Desktop")
	if err := os.MkdirAll(filepath.Dir(bin), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bin, []byte("binary"), 0o700); err != nil {
		t.Fatal(err)
	}
	marker, err := json.Marshal(map[string]string{"path": app})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(data, "desktop-install.json"), marker, 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := desktopPathFromMarker(data, "darwin"); err != nil || got != app {
		t.Fatalf("marker path = %q, %v", got, err)
	}
	if err := os.Remove(bin); err != nil {
		t.Fatal(err)
	}
	if _, err := desktopPathFromMarker(data, "darwin"); err == nil {
		t.Fatal("stale Desktop marker must be rejected")
	}
}

func TestDesktopServiceHasMCPRequiresAgentEndpoint(t *testing.T) {
	available := false
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/settings/mcp" || !available {
			http.NotFound(response, request)
			return
		}
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	if desktopServiceHasMCP(server.Client(), server.URL) {
		t.Fatal("Desktop without the Agent endpoint must not be accepted")
	}
	available = true
	if !desktopServiceHasMCP(server.Client(), server.URL) {
		t.Fatal("MCP-capable Desktop should be accepted")
	}
}

func TestCodexCommandOutputKeepsWarningsOutOfSuccessfulJSON(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell fixture is Unix-only")
	}
	output, err := codexCommandOutput(exec.Command("sh", "-c", "printf 'warning on stderr\\n' >&2; printf '{\"marketplaces\":[]}'"))
	if err != nil || string(output) != `{"marketplaces":[]}` {
		t.Fatalf("successful JSON output = %q, %v", output, err)
	}
	output, err = codexCommandOutput(exec.Command("sh", "-c", "printf 'failure detail\\n' >&2; exit 2"))
	if err == nil || !strings.Contains(string(output), "failure detail") {
		t.Fatalf("failed command output = %q, %v", output, err)
	}
}

func TestImportLocalFileAcceptsPathAndOptionalTitle(t *testing.T) {
	schema := objectSchema("path", stringSchema("Absolute path to one local file"), "title", stringSchema("Optional readable title"), "note", stringSchema("Context"))
	required, ok := schema["required"].([]string)
	if !ok || len(required) != 1 || required[0] != "path" {
		t.Fatalf("import required fields = %#v, want path only", schema["required"])
	}
	properties, ok := schema["properties"].(map[string]any)
	if !ok || len(properties) != 4 || properties["path"] == nil || properties["title"] == nil || properties["note"] == nil || properties["book_id"] == nil || properties["source_ids"] != nil {
		t.Fatalf("import schema must expose path, optional title, note, and a request-scoped Book without related source IDs: %#v", schema)
	}
}

func textResult(result *mcp.CallToolResult) string {
	if len(result.Content) == 0 {
		return ""
	}
	if text, ok := result.Content[0].(*mcp.TextContent); ok {
		return text.Text
	}
	return ""
}
