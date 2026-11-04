package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestShortAgentPageLinkResolvesRegisteredSession(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	const pageToken = "short-link-token-12345678901234567890"
	server.agentSessions["session-test"] = agentSessionScope{Token: pageToken, AgentName: "Codex", BookID: "sourcebook brand", UpdatedAt: time.Now()}
	request := httptest.NewRequest(http.MethodGet, "http://localhost:4177/p/"+agentPageLinkCode(pageToken)+"?panel=agent-submissions&batchId=batch-1", nil)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusFound {
		t.Fatalf("short link = %d: %s", result.Code, result.Body.String())
	}
	redirect, err := url.Parse(result.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	query := redirect.Query()
	if redirect.Path != "/" || query.Get("agentSession") != "session-test" || query.Get("agentSessionToken") != pageToken || query.Get("bookId") != "sourcebook brand" || query.Get("sourcebookHost") != "codex" || query.Get("panel") != "agent-submissions" || query.Get("batchId") != "batch-1" {
		t.Fatalf("short link redirect = %q", redirect.String())
	}
	unknown := httptest.NewRecorder()
	server.ServeHTTP(unknown, httptest.NewRequest(http.MethodGet, "http://localhost:4177/p/invalid", nil))
	if unknown.Code != http.StatusNotFound {
		t.Fatalf("unknown link = %d", unknown.Code)
	}
}

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
	if oldPageResult.Code != http.StatusOK {
		t.Fatalf("old page must remain usable until the new page claims its connection: %d %s", oldPageResult.Code, oldPageResult.Body.String())
	}

	newPage := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"replaced-token-123456789012","bookId":"sourcebook"}`))
	newPage.Host = "127.0.0.1:4177"
	newPageResult := httptest.NewRecorder()
	server.ServeHTTP(newPageResult, newPage)
	if newPageResult.Code != http.StatusConflict {
		t.Fatalf("unclaimed new page must not change scope: %d: %s", newPageResult.Code, newPageResult.Body.String())
	}
	claimNewPage := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/agent-sessions/session-test/reconnect", bytes.NewBufferString(`{"pageToken":"replaced-token-123456789012"}`))
	claimNewPage.Host = "127.0.0.1:4177"
	claimNewPageResult := httptest.NewRecorder()
	server.ServeHTTP(claimNewPageResult, claimNewPage)
	if claimNewPageResult.Code != http.StatusOK {
		t.Fatalf("claim new page = %d: %s", claimNewPageResult.Code, claimNewPageResult.Body.String())
	}
	oldPage = httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"123456789012345678901234","bookId":"sourcebook"}`))
	oldPage.Host = "127.0.0.1:4177"
	oldPageResult = httptest.NewRecorder()
	server.ServeHTTP(oldPageResult, oldPage)
	if oldPageResult.Code != http.StatusGone || !strings.Contains(oldPageResult.Body.String(), "replaced by a newer page") {
		t.Fatalf("old page must disconnect after the new page claims it: %d %s", oldPageResult.Code, oldPageResult.Body.String())
	}
	newPage = httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"replaced-token-123456789012","bookId":"sourcebook"}`))
	newPage.Host = "127.0.0.1:4177"
	newPageResult = httptest.NewRecorder()
	server.ServeHTTP(newPageResult, newPage)
	if newPageResult.Code != http.StatusOK {
		t.Fatalf("claimed new page scope = %d: %s", newPageResult.Code, newPageResult.Body.String())
	}

	useOldPage := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/agent-sessions/session-test/reconnect", bytes.NewBufferString(`{"pageToken":"123456789012345678901234"}`))
	useOldPage.Host = "127.0.0.1:4177"
	useOldPageResult := httptest.NewRecorder()
	server.ServeHTTP(useOldPageResult, useOldPage)
	if useOldPageResult.Code != http.StatusOK {
		t.Fatalf("use old page = %d: %s", useOldPageResult.Code, useOldPageResult.Body.String())
	}
	oldPage = httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"123456789012345678901234","bookId":"sourcebook"}`))
	oldPage.Host = "127.0.0.1:4177"
	oldPageResult = httptest.NewRecorder()
	server.ServeHTTP(oldPageResult, oldPage)
	if oldPageResult.Code != http.StatusOK {
		t.Fatalf("reconnected old page scope = %d: %s", oldPageResult.Code, oldPageResult.Body.String())
	}
	newPage = httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/session-test/scope", bytes.NewBufferString(`{"pageToken":"replaced-token-123456789012","bookId":"sourcebook"}`))
	newPage.Host = "127.0.0.1:4177"
	newPageResult = httptest.NewRecorder()
	server.ServeHTTP(newPageResult, newPage)
	if newPageResult.Code != http.StatusGone {
		t.Fatalf("the formerly current page must disconnect after using the old page: %d %s", newPageResult.Code, newPageResult.Body.String())
	}
}

func TestReplacedAgentTabCanExplicitlyReclaimItsConversation(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	oldToken := "old-page-token-1234567890123456"
	newToken := "new-page-token-1234567890123456"
	server.agentSessions["codex-chat"] = agentSessionScope{Token: oldToken, AgentName: "Codex", BookID: "sourcebook", UpdatedAt: time.Now()}
	call := func(method, path, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://127.0.0.1:4177"+path, strings.NewReader(body))
		request.Host = "127.0.0.1:4177"
		result := httptest.NewRecorder()
		server.ServeHTTP(result, request)
		return result
	}
	claim := func(token, instance string) {
		body := `{"pageToken":"` + token + `","pageInstanceId":"` + instance + `"}`
		if result := call(http.MethodPost, "/api/agent-sessions/codex-chat/reconnect", body); result.Code != http.StatusOK {
			t.Fatalf("claim %s = %d: %s", instance, result.Code, result.Body.String())
		}
	}
	state := func(token, instance string) string {
		path := "/api/agent-sessions/codex-chat/scope?pageToken=" + token + "&pageInstanceId=" + instance
		result := call(http.MethodGet, path, "")
		if result.Code != http.StatusOK {
			t.Fatalf("read %s = %d: %s", instance, result.Code, result.Body.String())
		}
		var scope map[string]any
		if err := json.NewDecoder(result.Body).Decode(&scope); err != nil {
			t.Fatal(err)
		}
		return stringValue(scope["pageState"])
	}
	claim(oldToken, "old-tab")
	register := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", strings.NewReader(`{"sessionId":"codex-chat","pageToken":"`+newToken+`","agentName":"Codex"}`))
	register.Host = "127.0.0.1:4177"
	if err := server.registerAgentSession(httptest.NewRecorder(), register); err != nil {
		t.Fatal(err)
	}
	claim(newToken, "new-tab")
	if got := state(oldToken, "old-tab"); got != "replaced" {
		t.Fatalf("old tab state after replacement = %q", got)
	}
	claim(oldToken, "old-tab")
	if got := state(oldToken, "old-tab"); got != "active" {
		t.Fatalf("old tab state after explicit reconnect = %q", got)
	}
	if got := state(newToken, "new-tab"); got != "replaced" {
		t.Fatalf("new tab state after old tab reconnect = %q", got)
	}
}

func TestDuplicateAgentPagesWithTheSameTokenRemainConnected(t *testing.T) {
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
	register := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", bytes.NewBufferString(`{"sessionId":"duplicate-page-test","pageToken":"duplicate-page-token-123456789","agentName":"Codex"}`))
	register.Host = "127.0.0.1:4177"
	register.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	if result := httptest.NewRecorder(); func() *httptest.ResponseRecorder { server.ServeHTTP(result, register); return result }().Code != http.StatusOK {
		t.Fatalf("register = %d", result.Code)
	}
	update := func(selected string) {
		body := `{"pageToken":"duplicate-page-token-123456789","bookId":"sourcebook","selectedSourceIds":["` + selected + `"]}`
		request := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:4177/api/agent-sessions/duplicate-page-test/scope", bytes.NewBufferString(body))
		request.Host = "127.0.0.1:4177"
		result := httptest.NewRecorder()
		server.ServeHTTP(result, request)
		if result.Code != http.StatusOK {
			t.Fatalf("scope update %s = %d: %s", selected, result.Code, result.Body.String())
		}
	}
	update("first")
	update("duplicate")
	readScope := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions/duplicate-page-test", nil)
	readScope.Host = "127.0.0.1:4177"
	readScope.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	readResult := httptest.NewRecorder()
	server.ServeHTTP(readResult, readScope)
	if !strings.Contains(readResult.Body.String(), `"selectedSourceIds":["duplicate"]`) {
		t.Fatalf("the latest explicit page update must be readable: %s", readResult.Body.String())
	}
}

func TestSameOwnerSessionsDoNotDisconnectEachOther(t *testing.T) {
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
	register := func(id, token string) {
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions", bytes.NewBufferString(`{"sessionId":"`+id+`","pageToken":"`+token+`","agentName":"WorkBuddy"}`))
		request.Host = "127.0.0.1:4177"
		request.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
		request.Header.Set("X-Sourcebook-Owner", "one-workbuddy-chat")
		result := httptest.NewRecorder()
		server.ServeHTTP(result, request)
		if result.Code != http.StatusOK {
			t.Fatalf("register %s = %d: %s", id, result.Code, result.Body.String())
		}
	}
	register("first-page", "first-page-token-123456789012")
	register("second-page", "second-page-token-12345678901")

	oldPage := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/agent-sessions/first-page/scope?pageToken=first-page-token-123456789012", nil)
	oldPage.Host = "127.0.0.1:4177"
	oldResult := httptest.NewRecorder()
	server.ServeHTTP(oldResult, oldPage)
	if oldResult.Code != http.StatusOK {
		t.Fatalf("a host-created second session must not disconnect the first page: %d %s", oldResult.Code, oldResult.Body.String())
	}
	active := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/mcp/v1/agent-sessions/active", nil)
	active.Host = "127.0.0.1:4177"
	active.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
	active.Header.Set("X-Sourcebook-Owner", "one-workbuddy-chat")
	activeResult := httptest.NewRecorder()
	server.ServeHTTP(activeResult, active)
	if activeResult.Code != http.StatusOK {
		t.Fatalf("active session = %d: %s", activeResult.Code, activeResult.Body.String())
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

func TestAgentPageOwnershipAndScopeSurviveDesktopRestart(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Sourcebook Library")
	library, err := OpenLibrary(root, "", "")
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
	call := func(target *Server, method, path, body, owner string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://127.0.0.1:4177"+path, strings.NewReader(body))
		request.Host = "127.0.0.1:4177"
		if strings.HasPrefix(path, "/api/mcp/v1/") {
			request.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
			request.Header.Set("X-Sourcebook-Owner", owner)
		}
		result := httptest.NewRecorder()
		target.ServeHTTP(result, request)
		return result
	}
	token := "page-token-123456789012345678901234"
	register := `{"sessionId":"persistent-chat","pageToken":"` + token + `","bookId":"sourcebook","agentName":"WorkBuddy"}`
	if result := call(server, http.MethodPost, "/api/mcp/v1/agent-sessions", register, "workbuddy-chat-a"); result.Code != http.StatusOK {
		t.Fatalf("register = %d: %s", result.Code, result.Body.String())
	}
	claim := `{"pageToken":"` + token + `","pageInstanceId":"tab-a"}`
	if result := call(server, http.MethodPost, "/api/agent-sessions/persistent-chat/reconnect", claim, ""); result.Code != http.StatusOK {
		t.Fatalf("claim first tab = %d: %s", result.Code, result.Body.String())
	}
	scope := `{"pageToken":"` + token + `","pageInstanceId":"tab-a","bookId":"sourcebook","selectedSourceIds":["one","two"],"filters":{"query":"cat"}}`
	if result := call(server, http.MethodPut, "/api/agent-sessions/persistent-chat/scope", scope, ""); result.Code != http.StatusOK {
		t.Fatalf("write first tab scope = %d: %s", result.Code, result.Body.String())
	}
	observerPath := "/api/agent-sessions/persistent-chat/scope?pageToken=" + token + "&pageInstanceId=tab-b"
	if result := call(server, http.MethodGet, observerPath, "", ""); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"pageState":"observer"`) {
		t.Fatalf("copied URL must be an observer = %d: %s", result.Code, result.Body.String())
	}
	if result := call(server, http.MethodPut, "/api/agent-sessions/persistent-chat/scope", strings.Replace(scope, "tab-a", "tab-b", 1), ""); result.Code != http.StatusConflict {
		t.Fatalf("observer must not change selection = %d: %s", result.Code, result.Body.String())
	}
	server = NewServer(library, "").(*Server)
	if result := call(server, http.MethodGet, "/api/agent-sessions/persistent-chat/scope?pageToken="+token+"&pageInstanceId=tab-a", "", ""); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"selectedSourceIds":["one","two"]`) || !strings.Contains(result.Body.String(), `"pageState":"active"`) {
		t.Fatalf("Desktop restart must restore the exact page scope = %d: %s", result.Code, result.Body.String())
	}
	if result := call(server, http.MethodGet, "/api/mcp/v1/agent-sessions/persistent-chat", "", "workbuddy-chat-b"); result.Code != http.StatusUnauthorized {
		t.Fatalf("another conversation must not read the restored page = %d: %s", result.Code, result.Body.String())
	}
	if result := call(server, http.MethodGet, "/api/mcp/v1/agent-sessions/persistent-chat", "", "workbuddy-chat-a"); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"pageToken":"`+token+`"`) {
		t.Fatalf("own conversation must restore active token = %d: %s", result.Code, result.Body.String())
	}
	info, err := os.Stat(server.agentSessionsPath)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("persisted page credentials need private permissions: %v, %v", info, err)
	}
	if err := server.resetLibrary(httptest.NewRecorder()); err != nil {
		t.Fatalf("clear local data = %v", err)
	}
	server = NewServer(library, "").(*Server)
	if result := call(server, http.MethodGet, "/api/agent-sessions/persistent-chat/scope?pageToken="+token+"&pageInstanceId=tab-a", "", ""); result.Code != http.StatusUnauthorized {
		t.Fatalf("clearing local data must remove saved Agent page scope = %d: %s", result.Code, result.Body.String())
	}
}

func TestBrowserCanBindItsCurrentScopeToReplacementMCPProcess(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
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
	call := func(method, path, body, owner string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://127.0.0.1:4177"+path, strings.NewReader(body))
		request.Host = "127.0.0.1:4177"
		if strings.HasPrefix(path, "/api/mcp/v1/") {
			request.Header.Set("X-Sourcebook-MCP-Token", settings.MCPToken)
			request.Header.Set("X-Sourcebook-Owner", owner)
		}
		result := httptest.NewRecorder()
		server.ServeHTTP(result, request)
		return result
	}
	token := "existing-page-token-1234567890123456"
	register := `{"sessionId":"existing-chat","pageToken":"` + token + `","bookId":"sourcebook","agentName":"Codex"}`
	if result := call(http.MethodPost, "/api/mcp/v1/agent-sessions", register, "codex-old-process"); result.Code != http.StatusOK {
		t.Fatalf("register = %d: %s", result.Code, result.Body.String())
	}
	if result := call(http.MethodPost, "/api/agent-sessions/existing-chat/reconnect", `{"pageToken":"`+token+`","pageInstanceId":"visible-tab"}`, ""); result.Code != http.StatusOK {
		t.Fatalf("page claim = %d: %s", result.Code, result.Body.String())
	}
	if result := call(http.MethodPut, "/api/agent-sessions/existing-chat/scope", `{"pageToken":"`+token+`","pageInstanceId":"visible-tab","bookId":"sourcebook","selectedSourceIds":["current-selection"]}`, ""); result.Code != http.StatusOK {
		t.Fatalf("page scope = %d: %s", result.Code, result.Body.String())
	}
	newProcess := call(http.MethodPost, "/api/mcp/v1/agent-page-bindings", `{"agentName":"Codex"}`, "codex-new-process")
	if newProcess.Code != http.StatusOK {
		t.Fatalf("request binding = %d: %s", newProcess.Code, newProcess.Body.String())
	}
	var pending struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(newProcess.Body).Decode(&pending); err != nil || pending.Code == "" {
		t.Fatalf("binding code = %#v, %v", pending, err)
	}
	bind := `{"pageToken":"` + token + `","pageInstanceId":"visible-tab","code":"` + pending.Code + `"}`
	if result := call(http.MethodPost, "/api/agent-sessions/existing-chat/bind", bind, ""); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"selectedSourceIds":["current-selection"]`) {
		t.Fatalf("bind current scope = %d: %s", result.Code, result.Body.String())
	}
	if result := call(http.MethodGet, "/api/mcp/v1/agent-sessions/existing-chat", "", "codex-old-process"); result.Code != http.StatusUnauthorized {
		t.Fatalf("old process must lose access = %d: %s", result.Code, result.Body.String())
	}
	if result := call(http.MethodGet, "/api/mcp/v1/agent-sessions/active", "", "codex-new-process"); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"selectedSourceIds":["current-selection"]`) {
		t.Fatalf("new process must read current tab = %d: %s", result.Code, result.Body.String())
	}
	server.agentSessionMu.Lock()
	delete(server.agentSessions, "existing-chat")
	if err := server.saveAgentSessionsLocked(); err != nil {
		server.agentSessionMu.Unlock()
		t.Fatal(err)
	}
	server.agentSessionMu.Unlock()
	thirdProcess := call(http.MethodPost, "/api/mcp/v1/agent-page-bindings", `{"agentName":"Codex"}`, "codex-third-process")
	if thirdProcess.Code != http.StatusOK {
		t.Fatalf("request after lost session = %d: %s", thirdProcess.Code, thirdProcess.Body.String())
	}
	if err := json.NewDecoder(thirdProcess.Body).Decode(&pending); err != nil {
		t.Fatal(err)
	}
	restore := `{"pageToken":"` + token + `","pageInstanceId":"visible-tab","code":"` + pending.Code + `","agentName":"Codex","bookId":"sourcebook","selectedSourceIds":["live-page-selection"],"filters":{"query":"live filter"}}`
	if result := call(http.MethodPost, "/api/agent-sessions/existing-chat/bind", restore, ""); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"selectedSourceIds":["live-page-selection"]`) {
		t.Fatalf("live page must restore its own scope without Desktop default = %d: %s", result.Code, result.Body.String())
	}
	if result := call(http.MethodGet, "/api/mcp/v1/agent-sessions/active", "", "codex-third-process"); result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"live-page-selection"`) {
		t.Fatalf("new process must read restored live page = %d: %s", result.Code, result.Body.String())
	}
}
