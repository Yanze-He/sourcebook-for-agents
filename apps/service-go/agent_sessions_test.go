package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
