package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestAgentPageScopeConnectsOnlyItsRegisteredMCPProcess(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	enable := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", bytes.NewBufferString(`{}`))
	enable.Host = "127.0.0.1:4177"
	enableResult := httptest.NewRecorder()
	server.ServeHTTP(enableResult, enable)
	settings, err := server.readDesktopSettings()
	if err != nil {
		t.Fatal(err)
	}
	register := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", bytes.NewBufferString(`{"sessionId":"session-test","pageToken":"123456789012345678901234","agentName":"WorkBuddy"}`))
	register.Host = "127.0.0.1:4177"
	register.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	registerResult := httptest.NewRecorder()
	server.ServeHTTP(registerResult, register)
	if registerResult.Code != http.StatusOK {
		t.Fatalf("register = %d: %s", registerResult.Code, registerResult.Body.String())
	}

	setScope := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"123456789012345678901234","bookId":"sourcebook"}`))
	setScope.Host = "127.0.0.1:4177"
	setScopeResult := httptest.NewRecorder()
	server.ServeHTTP(setScopeResult, setScope)
	if setScopeResult.Code != http.StatusOK {
		t.Fatalf("set scope = %d: %s", setScopeResult.Code, setScopeResult.Body.String())
	}

	readScope := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions/session-test", nil)
	readScope.Host = "127.0.0.1:4177"
	readScope.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	readScopeResult := httptest.NewRecorder()
	server.ServeHTTP(readScopeResult, readScope)
	if readScopeResult.Code != http.StatusOK {
		t.Fatalf("read scope = %d: %s", readScopeResult.Code, readScopeResult.Body.String())
	}
	var scope map[string]any
	if err := json.NewDecoder(readScopeResult.Body).Decode(&scope); err != nil {
		t.Fatal(err)
	}
	if scope["bookId"] != "sourcebook" {
		t.Fatalf("scope = %#v", scope)
	}

	replace := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", bytes.NewBufferString(`{"sessionId":"session-test","pageToken":"replaced-token-123456789012","agentName":"WorkBuddy"}`))
	replace.Host = "127.0.0.1:4177"
	replace.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	replaceResult := httptest.NewRecorder()
	server.ServeHTTP(replaceResult, replace)
	if replaceResult.Code != http.StatusOK {
		t.Fatalf("replace session = %d: %s", replaceResult.Code, replaceResult.Body.String())
	}

	oldPage := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"123456789012345678901234","bookId":"sourcebook"}`))
	oldPage.Host = "127.0.0.1:4177"
	oldPageResult := httptest.NewRecorder()
	server.ServeHTTP(oldPageResult, oldPage)
	if oldPageResult.Code != http.StatusUnauthorized {
		t.Fatalf("old page scope = %d: %s", oldPageResult.Code, oldPageResult.Body.String())
	}

	newPage := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"replaced-token-123456789012","bookId":"sourcebook"}`))
	newPage.Host = "127.0.0.1:4177"
	newPageResult := httptest.NewRecorder()
	server.ServeHTTP(newPageResult, newPage)
	if newPageResult.Code != http.StatusOK {
		t.Fatalf("new page scope = %d: %s", newPageResult.Code, newPageResult.Body.String())
	}
}

func TestAgentSessionRecoversScopeForTheSameAnonymousOwner(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	enable := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", bytes.NewBufferString(`{}`))
	enable.Host = "127.0.0.1:4177"
	server.ServeHTTP(httptest.NewRecorder(), enable)
	settings, err := server.readDesktopSettings()
	if err != nil {
		t.Fatal(err)
	}
	owner := "workbuddy-anonymous-test-owner"
	register := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", bytes.NewBufferString(`{"sessionId":"recovery-test","pageToken":"123456789012345678901234","agentName":"WorkBuddy"}`))
	register.Host = "127.0.0.1:4177"
	register.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	register.Header.Set("X-Sourcebook-Owner", owner)
	if result := httptest.NewRecorder(); func() *httptest.ResponseRecorder { server.ServeHTTP(result, register); return result }().Code != http.StatusOK {
		t.Fatalf("register = %d", result.Code)
	}
	update := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/recovery-test/scope", bytes.NewBufferString(`{"pageToken":"123456789012345678901234","bookId":"sourcebook","selectedSourceIds":["one","two"],"filteredSourceIds":["one","two","three"],"filters":{"onlyFavorites":true}}`))
	update.Host = "127.0.0.1:4177"
	if result := httptest.NewRecorder(); func() *httptest.ResponseRecorder { server.ServeHTTP(result, update); return result }().Code != http.StatusOK {
		t.Fatalf("update = %d", result.Code)
	}
	active := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions/active", nil)
	active.Host = "127.0.0.1:4177"
	active.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	active.Header.Set("X-Sourcebook-Owner", owner)
	activeResult := httptest.NewRecorder()
	server.ServeHTTP(activeResult, active)
	if activeResult.Code != http.StatusOK {
		t.Fatalf("active = %d: %s", activeResult.Code, activeResult.Body.String())
	}
	var payload struct {
		Session struct {
			SessionID, PageToken, BookID         string
			SelectedSourceIDs, FilteredSourceIDs []string
		} `json:"session"`
	}
	if err := json.NewDecoder(activeResult.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Session.SessionID != "recovery-test" || payload.Session.PageToken != "123456789012345678901234" || payload.Session.BookID != "sourcebook" || len(payload.Session.SelectedSourceIDs) != 2 || len(payload.Session.FilteredSourceIDs) != 3 {
		t.Fatalf("recovered session = %#v", payload.Session)
	}
	otherOwner := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions/active", nil)
	otherOwner.Host = "127.0.0.1:4177"
	otherOwner.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	otherOwner.Header.Set("X-Sourcebook-Owner", "workbuddy-other-owner")
	otherResult := httptest.NewRecorder()
	server.ServeHTTP(otherResult, otherOwner)
	if otherResult.Code != http.StatusOK || !strings.Contains(otherResult.Body.String(), `"session":null`) {
		t.Fatalf("other owner = %d: %s", otherResult.Code, otherResult.Body.String())
	}
}
