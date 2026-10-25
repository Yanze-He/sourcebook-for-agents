package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMCPSettingsExposeIndependentPluginGuideWithoutBundlePaths(t *testing.T) {
	payload := (&Server{}).mcpSettingsPayload(desktopSettings{MCPEnabled: true, MCPToken: "paired"})
	if payload["guideUrl"] != "https://github.com/Yanze-He/sourcebook-for-agents/blob/main/docs/install-agent-plugin.md" || payload["installReady"] != true || payload["serviceReady"] != true {
		t.Fatalf("independent plugin payload = %v", payload)
	}
	for _, legacy := range []string{"agentVersion", "installGuides", "bundledResourcesReady"} {
		if _, exists := payload[legacy]; exists {
			t.Fatalf("must not expose Desktop-bundled Plugin field %q: %v", legacy, payload)
		}
	}
}

func TestMCPBridgeRequiresPairingAndScopesSuggestionsToBooks(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)

	unauthorized := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/books", nil)
	unauthorized.Host = "127.0.0.1:4177"
	unauthorizedResult := httptest.NewRecorder()
	server.ServeHTTP(unauthorizedResult, unauthorized)
	if unauthorizedResult.Code != http.StatusUnauthorized {
		t.Fatalf("unpaired bridge status = %d", unauthorizedResult.Code)
	}

	enable := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", bytes.NewBufferString(`{}`))
	enable.Host = "127.0.0.1:4177"
	enable.Header.Set("content-type", "application/json")
	enableResult := httptest.NewRecorder()
	server.ServeHTTP(enableResult, enable)
	if enableResult.Code != http.StatusOK {
		t.Fatalf("enable status = %d: %s", enableResult.Code, enableResult.Body.String())
	}
	settings, err := server.readDesktopSettings()
	if err != nil || settings.MCPToken == "" {
		t.Fatalf("pairing token was not saved: %v", err)
	}
	status := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/status", nil)
	status.Host = "127.0.0.1:4177"
	status.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	statusResult := httptest.NewRecorder()
	server.ServeHTTP(statusResult, status)
	if statusResult.Code != http.StatusOK {
		t.Fatalf("bridge status = %d: %s", statusResult.Code, statusResult.Body.String())
	}
	var bridgeStatus struct {
		BridgeVersionMin int      `json:"bridgeVersionMin"`
		BridgeVersionMax int      `json:"bridgeVersionMax"`
		Capabilities     []string `json:"capabilities"`
	}
	if err := json.NewDecoder(statusResult.Body).Decode(&bridgeStatus); err != nil {
		t.Fatal(err)
	}
	if bridgeStatus.BridgeVersionMin != 1 || bridgeStatus.BridgeVersionMax != 1 || len(bridgeStatus.Capabilities) == 0 {
		t.Fatalf("bridge compatibility status = %#v", bridgeStatus)
	}

	list := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/books", nil)
	list.Host = "127.0.0.1:4177"
	list.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	listResult := httptest.NewRecorder()
	server.ServeHTTP(listResult, list)
	if listResult.Code != http.StatusOK {
		t.Fatalf("paired bridge status = %d: %s", listResult.Code, listResult.Body.String())
	}
	if bytes.Contains(listResult.Body.Bytes(), []byte(settings.MCPToken)) {
		t.Fatal("bridge response exposed pairing token")
	}

	filePayload := []byte(`{"kind":"import_local_file","payload":{"path":"/tmp/generated-cat.png"}}`)
	fileProposal := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/books/sourcebook/proposals", bytes.NewReader(filePayload))
	fileProposal.Host = "127.0.0.1:4177"
	fileProposal.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	fileProposalResult := httptest.NewRecorder()
	server.ServeHTTP(fileProposalResult, fileProposal)
	if fileProposalResult.Code != http.StatusAccepted {
		t.Fatalf("unrelated file proposal status = %d: %s", fileProposalResult.Code, fileProposalResult.Body.String())
	}
	var proposedFile struct {
		Suggestion mcpSuggestion `json:"suggestion"`
	}
	if err := json.NewDecoder(fileProposalResult.Body).Decode(&proposedFile); err != nil {
		t.Fatal(err)
	}
	if len(proposedFile.Suggestion.SourceItemIDs) != 0 {
		t.Fatalf("unrelated file gained a source association: %#v", proposedFile.Suggestion.SourceItemIDs)
	}

	payload, _ := json.Marshal(map[string]any{"kind": "create_text_source", "payload": map[string]any{"title": "Agent note", "content": "Draft only"}})
	proposal := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/books/sourcebook/proposals", bytes.NewReader(payload))
	proposal.Host = "127.0.0.1:4177"
	proposal.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	proposalResult := httptest.NewRecorder()
	server.ServeHTTP(proposalResult, proposal)
	if proposalResult.Code != http.StatusAccepted {
		t.Fatalf("proposal status = %d: %s", proposalResult.Code, proposalResult.Body.String())
	}
	var created struct {
		Suggestion mcpSuggestion `json:"suggestion"`
	}
	if err := json.NewDecoder(proposalResult.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	var sourceCount, suggestionCount int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&sourceCount); err != nil {
		t.Fatal(err)
	}
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM agent_suggestions WHERE status='pending'").Scan(&suggestionCount); err != nil {
		t.Fatal(err)
	}
	if sourceCount != 0 || suggestionCount != 2 {
		t.Fatalf("proposal changed sources=%d suggestions=%d", sourceCount, suggestionCount)
	}

	accept := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/suggestions/sourcebook/"+created.Suggestion.ID+"/accept", nil)
	accept.Host = "127.0.0.1:4177"
	acceptResult := httptest.NewRecorder()
	server.ServeHTTP(acceptResult, accept)
	if acceptResult.Code != http.StatusOK {
		t.Fatalf("accept status = %d: %s", acceptResult.Code, acceptResult.Body.String())
	}
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&sourceCount); err != nil {
		t.Fatal(err)
	}
	if sourceCount != 1 {
		t.Fatalf("accepted suggestion did not create a source: %d", sourceCount)
	}
}

func TestMCPBookOperationsAndSubmissionBatchAreRetrySafe(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	enable := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", nil)
	enable.Host = "127.0.0.1:4177"
	server.ServeHTTP(httptest.NewRecorder(), enable)
	settings, err := server.readDesktopSettings()
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path string, body any) (int, map[string]any) {
		var reader *bytes.Reader
		if body == nil {
			reader = bytes.NewReader(nil)
		} else {
			encoded, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			reader = bytes.NewReader(encoded)
		}
		request := httptest.NewRequest(method, "http://127.0.0.1:4177"+path, reader)
		request.Host = "127.0.0.1:4177"
		request.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		result := map[string]any{}
		_ = json.Unmarshal(response.Body.Bytes(), &result)
		return response.Code, result
	}
	status, created := call(http.MethodPost, "/api/mcp/v1/books", map[string]any{"name": "Brand", "idempotencyKey": "create-brand-0001"})
	if status != http.StatusCreated {
		t.Fatalf("create Book status=%d payload=%#v", status, created)
	}
	book := created["book"].(map[string]any)
	bookID := book["id"].(string)
	if book["revision"].(float64) != 1 {
		t.Fatalf("initial revision=%#v", book)
	}
	status, retried := call(http.MethodPost, "/api/mcp/v1/books", map[string]any{"name": "Brand", "idempotencyKey": "create-brand-0001"})
	if status != http.StatusCreated || retried["reused"] != true || retried["book"].(map[string]any)["id"] != bookID {
		t.Fatalf("create retry=%d %#v", status, retried)
	}
	status, resolved := call(http.MethodGet, "/api/mcp/v1/books/resolve?name=brand", nil)
	if status != http.StatusOK || resolved["found"] != true || resolved["matches"].([]any)[0].(map[string]any)["id"] != bookID {
		t.Fatalf("resolve=%d %#v", status, resolved)
	}
	status, renamed := call(http.MethodPatch, "/api/mcp/v1/books/"+bookID, map[string]any{"name": "Brand 2026", "expectedRevision": 1})
	if status != http.StatusOK || renamed["book"].(map[string]any)["revision"].(float64) != 2 {
		t.Fatalf("rename=%d %#v", status, renamed)
	}
	status, _ = call(http.MethodPatch, "/api/mcp/v1/books/"+bookID, map[string]any{"name": "Stale overwrite", "expectedRevision": 1})
	if status != http.StatusConflict {
		t.Fatalf("stale rename status=%d, want conflict error", status)
	}
	items := []map[string]any{
		{"kind": "create_text_source", "payload": map[string]any{"title": "Summary", "content": "Confirmed outcome", "note": "From the user-approved task."}},
		{"kind": "create_text_source", "payload": map[string]any{"title": "Decisions", "content": "Keep the review step.", "note": "From the user-approved task."}},
	}
	status, proposed := call(http.MethodPost, "/api/mcp/v1/books/"+bookID+"/proposal-batches", map[string]any{"idempotencyKey": "bundle-brand-0001", "items": items})
	if status != http.StatusAccepted {
		t.Fatalf("batch status=%d payload=%#v", status, proposed)
	}
	batch := proposed["batch"].(map[string]any)
	batchID := batch["id"].(string)
	if len(batch["suggestions"].([]any)) != 2 || !strings.Contains(batch["reviewUrl"].(string), "panel=agent-submissions") {
		t.Fatalf("batch=%#v", batch)
	}
	status, retriedBatch := call(http.MethodPost, "/api/mcp/v1/books/"+bookID+"/proposal-batches", map[string]any{"idempotencyKey": "bundle-brand-0001", "items": items})
	if status != http.StatusAccepted || retriedBatch["reused"] != true || retriedBatch["batch"].(map[string]any)["id"] != batchID {
		t.Fatalf("batch retry=%d %#v", status, retriedBatch)
	}
	status, fetched := call(http.MethodGet, "/api/mcp/v1/books/"+bookID+"/proposal-batches/"+batchID, nil)
	if status != http.StatusOK || fetched["batch"].(map[string]any)["id"] != batchID {
		t.Fatalf("batch fetch=%d %#v", status, fetched)
	}
}

func TestMCPRevokeImmediatelyInvalidatesBridge(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	enable := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", nil)
	enable.Host = "127.0.0.1:4177"
	server.ServeHTTP(httptest.NewRecorder(), enable)
	settings, _ := server.readDesktopSettings()
	revoke := httptest.NewRequest(http.MethodDelete, "http://127.0.0.1:4177/api/settings/mcp", nil)
	revoke.Host = "127.0.0.1:4177"
	revokeResult := httptest.NewRecorder()
	server.ServeHTTP(revokeResult, revoke)
	if revokeResult.Code != http.StatusOK {
		t.Fatalf("revoke status = %d", revokeResult.Code)
	}
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/status", nil)
	request.Host = "127.0.0.1:4177"
	request.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusUnauthorized {
		t.Fatalf("revoked bridge status = %d", result.Code)
	}
}

func TestMCPRejectsNewPackSuggestions(t *testing.T) {
	if allowedSuggestionKind("pack") {
		t.Fatal("pack must not be accepted as a new MCP suggestion kind")
	}
}

func TestMCPNewSourcesCannotBorrowExistingSourceIDs(t *testing.T) {
	for _, test := range []struct {
		kind    string
		payload map[string]any
	}{
		{"create_text_source", map[string]any{"content": "A new note"}},
		{"import_local_file", map[string]any{"path": "/tmp/new.png"}},
	} {
		if err := validateSuggestion(test.kind, test.payload, []string{"unrelated-source"}); err == nil {
			t.Fatalf("%s accepted an unrelated source ID", test.kind)
		}
		if err := validateSuggestion(test.kind, test.payload, nil); err != nil {
			t.Fatalf("%s rejected a proposal without source IDs: %v", test.kind, err)
		}
	}
	if err := validateSuggestion("update_source_metadata", map[string]any{"changes": map[string]any{}}, []string{"target-source"}); err == nil {
		t.Fatal("metadata update accepted an empty change set")
	}
}

func TestMCPFileSuggestionPreviewStreamsLocalMedia(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "generated-cat.png")
	if err := os.WriteFile(path, imageBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"path": path})
	if _, err := ctx.DB.Exec("INSERT INTO agent_suggestions (id,kind,payload_json,source_item_ids_json,agent_name,created_at,status,reviewed_at,review_error) VALUES (?,?,?,?,?,?,?,?,?)", "suggestion-image", "import_local_file", string(payload), "[]", "test", now(), "pending", "", ""); err != nil {
		t.Fatal(err)
	}
	url := "http://127.0.0.1:4177/api/mcp/suggestions/sourcebook/suggestion-image/preview"
	preview := httptest.NewRequest(http.MethodGet, url, nil)
	preview.Host = "127.0.0.1:4177"
	preview.Header.Set("Sec-Fetch-Site", "same-origin")
	result := httptest.NewRecorder()
	server.ServeHTTP(result, preview)
	if result.Code != http.StatusOK || result.Header().Get("Content-Type") != "image/png" || !bytes.Equal(result.Body.Bytes(), imageBytes) {
		t.Fatalf("preview = %d %s: %s", result.Code, result.Header().Get("Content-Type"), result.Body.String())
	}
	var sourceCount int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&sourceCount); err != nil || sourceCount != 0 {
		t.Fatalf("preview imported data: count=%d err=%v", sourceCount, err)
	}
	crossSite := httptest.NewRequest(http.MethodGet, url, nil)
	crossSite.Host = "127.0.0.1:4177"
	crossSite.Header.Set("Sec-Fetch-Site", "cross-site")
	crossSiteResult := httptest.NewRecorder()
	server.ServeHTTP(crossSiteResult, crossSite)
	if crossSiteResult.Code != http.StatusForbidden {
		t.Fatalf("cross-site preview status = %d", crossSiteResult.Code)
	}
	for _, media := range []struct{ id, extension, mime string }{{"video", ".mp4", "video/mp4"}, {"audio", ".wav", "audio/wav"}} {
		mediaPath := filepath.Join(t.TempDir(), "agent-output"+media.extension)
		mediaBytes := []byte("sample-media-for-range-test")
		if err := os.WriteFile(mediaPath, mediaBytes, 0o600); err != nil {
			t.Fatal(err)
		}
		mediaPayload, _ := json.Marshal(map[string]any{"path": mediaPath})
		if _, err := ctx.DB.Exec("INSERT INTO agent_suggestions (id,kind,payload_json,source_item_ids_json,agent_name,created_at,status,reviewed_at,review_error) VALUES (?,?,?,?,?,?,?,?,?)", "suggestion-"+media.id, "import_local_file", string(mediaPayload), "[]", "test", now(), "pending", "", ""); err != nil {
			t.Fatal(err)
		}
		mediaRequest := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/suggestions/sourcebook/suggestion-"+media.id+"/preview", nil)
		mediaRequest.Host = "127.0.0.1:4177"
		mediaRequest.Header.Set("Sec-Fetch-Site", "same-origin")
		mediaRequest.Header.Set("Range", "bytes=0-5")
		mediaResult := httptest.NewRecorder()
		server.ServeHTTP(mediaResult, mediaRequest)
		if mediaResult.Code != http.StatusPartialContent || mediaResult.Header().Get("Content-Type") != media.mime || mediaResult.Body.String() != "sample" {
			t.Fatalf("%s range preview = %d %s: %q", media.id, mediaResult.Code, mediaResult.Header().Get("Content-Type"), mediaResult.Body.String())
		}
	}
}
