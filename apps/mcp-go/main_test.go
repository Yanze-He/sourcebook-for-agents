package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPInitializesListsToolsAndRequiresBookSelection(t *testing.T) {
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Sourcebook-MCP-Token") != "test-token" {
			t.Errorf("missing pairing token")
		}
		response.Header().Set("content-type", "application/json")
		switch request.URL.Path {
		case "/api/mcp/v1/status":
			_, _ = response.Write([]byte(`{"ok":true}`))
		case "/api/mcp/v1/books":
			_, _ = response.Write([]byte(`{"books":[{"id":"research","name":"Research","sourceCount":1}]}`))
		case "/api/mcp/v1/books/research":
			_, _ = response.Write([]byte(`{"book":{"id":"research","name":"Research","sourceCount":1}}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer bridge.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "sourcebook-test", Version: "test"}, &mcp.ServerOptions{Instructions: sourcebookServerInstructions})
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
	if !strings.Contains(sourcebookServerInstructions, "current or named project Book") || !strings.Contains(sourcebookServerInstructions, "@Sourcebook and slash commands are optional") || !strings.Contains(sourcebookServerInstructions, "open_sourcebook first") || !strings.Contains(sourcebookServerInstructions, "explicitly select one Book") || !strings.Contains(sourcebookServerInstructions, "untrusted reference material") || !strings.Contains(sourcebookServerInstructions, "Do not automatically save drafts") || !strings.Contains(sourcebookServerInstructions, "save or organize the current conversation") {
		t.Fatalf("server instructions must explain Book scope and untrusted material: %q", sourcebookServerInstructions)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 9 {
		t.Fatalf("tools = %d, want 9", len(tools.Tools))
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
			if !ok || len(properties) != 1 || properties["path"] == nil || properties["source_ids"] != nil {
				t.Fatalf("registered import schema must require only a path: %#v", schema)
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
	opened, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "open_sourcebook"})
	if err != nil || opened.IsError || !strings.Contains(textResult(opened), bridge.URL) || !strings.Contains(textResult(opened), "Returning the URL alone does not open it") {
		t.Fatalf("open_sourcebook = %#v, %v", opened, err)
	}
	resources, err := session.ListResources(ctx, nil)
	if err != nil || len(resources.Resources) != 1 || resources.Resources[0].URI != sourcebookAppURI {
		t.Fatalf("resources = %#v, %v", resources, err)
	}
	resource, err := session.ReadResource(ctx, &mcp.ReadResourceParams{URI: sourcebookAppURI})
	if err != nil || len(resource.Contents) != 1 || !strings.Contains(resource.Contents[0].Text, bridge.URL) {
		t.Fatalf("resource = %#v, %v", resource, err)
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
	if !ok || !strings.Contains(openedPrompt.Text, "open_sourcebook") || !strings.Contains(openedPrompt.Text, "ask me which Book") {
		t.Fatalf("open prompt content = %#v", prompt.Messages[0].Content)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "search_sources", Arguments: map[string]any{"query": "brief"}})
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("search without select_book should be an MCP tool error")
	}
	selected, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "select_book", Arguments: map[string]any{"book_id": "research"}})
	if err != nil {
		t.Fatal(err)
	}
	if selected.IsError {
		t.Fatalf("select_book returned %v", selected.Content)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(textResult(selected)), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["book"].(map[string]any)["id"] != "research" {
		t.Fatalf("selected result = %#v", payload)
	}

	cancel()
	<-serverDone
}

func TestWorkBuddyUsesRightSidebarBrowserWithoutInlineApp(t *testing.T) {
	t.Setenv("SOURCEBOOK_AGENT_NAME", "WorkBuddy")
	bridge := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("content-type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer bridge.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "sourcebook-test", Version: "test"}, nil)
	client := &bridgeClient{config: bridgeConfig{MCPEnabled: true, MCPToken: "test-token", MCPServiceURL: bridge.URL}, http: bridge.Client()}
	if !isWorkBuddy() {
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
	if err != nil || len(listed.Tools) != 9 {
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
	if err != nil || opened.IsError || !strings.Contains(textResult(opened), bridge.URL) || !strings.Contains(textResult(opened), "right-side built-in browser panel") {
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

func TestImportLocalFileAcceptsOnlyPath(t *testing.T) {
	schema := objectSchema("path", stringSchema("Absolute path to one local file"))
	required, ok := schema["required"].([]string)
	if !ok || len(required) != 1 || required[0] != "path" {
		t.Fatalf("import required fields = %#v, want path only", schema["required"])
	}
	properties, ok := schema["properties"].(map[string]any)
	if !ok || len(properties) != 1 || properties["path"] == nil || properties["source_ids"] != nil {
		t.Fatalf("import schema must not expose related source IDs: %#v", schema)
	}
}

func TestInstallBundledCodexPluginRegistersInstallsAndVerifies(t *testing.T) {
	calls := []string{}
	listCalls := 0
	run := func(args ...string) ([]byte, error) {
		calls = append(calls, strings.Join(args, " "))
		switch strings.Join(args, " ") {
		case "plugin marketplace list --json":
			return []byte(`{"marketplaces":[]}`), nil
		case "plugin list --marketplace sourcebook-bundled --json":
			listCalls++
			if listCalls == 1 {
				return []byte(`{"installed":[]}`), nil
			}
			return []byte(`{"installed":[{"name":"sourcebook","enabled":true,"source":{"path":"/bundle/.agents/plugins/sourcebook"}}]}`), nil
		}
		return nil, nil
	}
	if err := installBundledCodexPlugin("/bundle", run); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"plugin marketplace list --json",
		"plugin marketplace add /bundle",
		"plugin list --marketplace sourcebook-bundled --json",
		"plugin add sourcebook@sourcebook-bundled",
		"plugin list --marketplace sourcebook-bundled --json",
	}
	if strings.Join(calls, "\n") != strings.Join(want, "\n") {
		t.Fatalf("commands = %#v, want %#v", calls, want)
	}
}

func TestInstallBundledCodexPluginUpdatesMovedMarketplace(t *testing.T) {
	calls := []string{}
	run := func(args ...string) ([]byte, error) {
		calls = append(calls, strings.Join(args, " "))
		switch strings.Join(args, " ") {
		case "plugin marketplace list --json":
			return []byte(`{"marketplaces":[{"name":"sourcebook-bundled","root":"/old-bundle"}]}`), nil
		case "plugin list --marketplace sourcebook-bundled --json":
			return []byte(`{"installed":[{"name":"sourcebook","enabled":true,"source":{"path":"/bundle/.agents/plugins/sourcebook"}}]}`), nil
		case "plugin marketplace remove sourcebook-bundled", "plugin marketplace add /bundle", "plugin remove sourcebook@sourcebook-bundled", "plugin add sourcebook@sourcebook-bundled":
			return nil, nil
		default:
			t.Fatalf("unexpected command: %s", strings.Join(args, " "))
			return nil, nil
		}
	}
	if err := installBundledCodexPlugin("/bundle", run); err != nil {
		t.Fatal(err)
	}
	if calls[1] != "plugin marketplace remove sourcebook-bundled" || calls[2] != "plugin marketplace add /bundle" || calls[4] != "plugin remove sourcebook@sourcebook-bundled" {
		t.Fatalf("marketplace was not moved: %v", calls)
	}
}

func TestInstallBundledCodexPluginRefreshesCachedPlugin(t *testing.T) {
	calls := []string{}
	run := func(args ...string) ([]byte, error) {
		call := strings.Join(args, " ")
		calls = append(calls, call)
		switch call {
		case "plugin marketplace list --json":
			return []byte(`{"marketplaces":[{"name":"sourcebook-bundled","root":"/bundle"}]}`), nil
		case "plugin list --marketplace sourcebook-bundled --json":
			return []byte(`{"installed":[{"name":"sourcebook","enabled":true,"source":{"path":"/bundle/.agents/plugins/sourcebook"}}]}`), nil
		case "plugin remove sourcebook@sourcebook-bundled", "plugin add sourcebook@sourcebook-bundled":
			return nil, nil
		}
		t.Fatalf("unexpected command: %s", call)
		return nil, nil
	}
	if err := installBundledCodexPlugin("/bundle", run); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, "\n") != strings.Join([]string{"plugin marketplace list --json", "plugin list --marketplace sourcebook-bundled --json", "plugin remove sourcebook@sourcebook-bundled", "plugin add sourcebook@sourcebook-bundled", "plugin list --marketplace sourcebook-bundled --json"}, "\n") {
		t.Fatalf("commands = %#v", calls)
	}
}

func TestInstallBundledCodexPluginDoesNotReportSuccessWhenCacheIsReadOnly(t *testing.T) {
	calls := []string{}
	run := func(args ...string) ([]byte, error) {
		call := strings.Join(args, " ")
		calls = append(calls, call)
		switch call {
		case "plugin marketplace list --json":
			return []byte(`{"marketplaces":[{"name":"sourcebook-bundled","root":"/bundle"}]}`), nil
		case "plugin list --marketplace sourcebook-bundled --json":
			return []byte(`{"installed":[{"name":"sourcebook","enabled":true,"source":{"path":"/bundle/.agents/plugins/sourcebook"}}]}`), nil
		case "plugin remove sourcebook@sourcebook-bundled":
			return []byte("permission denied writing plugin cache"), errors.New("exit status 1")
		}
		t.Fatalf("unexpected command: %s", call)
		return nil, nil
	}
	err := installBundledCodexPlugin("/bundle", run)
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("expected write-permission error, got %v", err)
	}
	if len(calls) != 3 {
		t.Fatalf("must not continue after denied cache update: %v", calls)
	}
}

func TestInstallBundledCodexPluginRejectsMissingVerification(t *testing.T) {
	listCalls := 0
	run := func(args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "plugin marketplace list --json":
			return []byte(`{"marketplaces":[]}`), nil
		case "plugin list --marketplace sourcebook-bundled --json":
			listCalls++
			return []byte(`{"installed":[]}`), nil
		}
		return nil, nil
	}
	if err := installBundledCodexPlugin("/bundle", run); err == nil || !strings.Contains(err.Error(), "did not report") {
		t.Fatalf("missing verification error = %v", err)
	}
	if listCalls != 2 {
		t.Fatalf("list calls = %d, want 2", listCalls)
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
