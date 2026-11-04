package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// agentSessionScope is intentionally memory-only. It connects one local MCP
// stdio process to the one browser page it opened; it is not a cross-device
// identity, and disappears when Desktop restarts.
type agentSessionScope struct {
	Token             string
	RetiredTokens     []string
	AgentName         string
	OwnerID           string
	BookID            string
	SelectedSourceIDs []string
	FilteredSourceIDs []string
	Filters           map[string]any
	Revision          int
	UpdatedAt         time.Time
	PendingToken      string
	PendingAt         time.Time
	PendingBookID     string
	PageInstanceID    string
}

type agentPageBindingRequest struct {
	OwnerID   string
	AgentName string
	CreatedAt time.Time
}

func (server *Server) cleanupAgentPageBindingsLocked(now time.Time) {
	for code, request := range server.agentPageBindings {
		if now.Sub(request.CreatedAt) > 2*time.Minute {
			delete(server.agentPageBindings, code)
		}
	}
}

func (server *Server) createAgentPageBinding(response http.ResponseWriter, request *http.Request) error {
	ownerID := strings.TrimSpace(request.Header.Get("X-Sourcebook-Owner"))
	if ownerID == "" {
		return &apiError{status: http.StatusBadRequest, code: "AGENT_SESSION_OWNER_REQUIRED", message: "This Agent connection has no conversation identity."}
	}
	payload, err := readBody(request)
	if err != nil {
		return err
	}
	agentName := truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80)
	if agentName == "" {
		return &apiError{status: http.StatusBadRequest, code: "AGENT_NAME_REQUIRED", message: "Agent name is required."}
	}
	secret := make([]byte, 6)
	if _, err := rand.Read(secret); err != nil {
		return err
	}
	code := base64.RawURLEncoding.EncodeToString(secret)
	server.agentSessionMu.Lock()
	server.cleanupAgentPageBindingsLocked(time.Now())
	for existingCode, existing := range server.agentPageBindings {
		if existing.OwnerID == ownerID {
			delete(server.agentPageBindings, existingCode)
		}
	}
	server.agentPageBindings[code] = agentPageBindingRequest{OwnerID: ownerID, AgentName: agentName, CreatedAt: time.Now()}
	server.agentSessionMu.Unlock()
	writeJSON(response, http.StatusOK, map[string]any{"code": code, "expiresInSeconds": 120})
	return nil
}

func (server *Server) listAgentPageBindings(response http.ResponseWriter, request *http.Request) error {
	agentName := strings.TrimSpace(request.URL.Query().Get("agentName"))
	server.agentSessionMu.Lock()
	server.cleanupAgentPageBindingsLocked(time.Now())
	bindings := make([]map[string]any, 0)
	for code, pending := range server.agentPageBindings {
		if strings.EqualFold(agentName, pending.AgentName) {
			bindings = append(bindings, map[string]any{"code": code, "agentName": pending.AgentName})
		}
	}
	server.agentSessionMu.Unlock()
	writeJSON(response, http.StatusOK, map[string]any{"requests": bindings})
	return nil
}

// Agent page scopes live beside Desktop settings, independently of the
// movable Book library. A Desktop restart must not silently replace a chat's
// Book and selection with the ordinary Desktop browsing default.
func (server *Server) loadAgentSessions() {
	data, err := os.ReadFile(server.agentSessionsPath)
	if os.IsNotExist(err) {
		return
	}
	if err != nil {
		server.agentSessionsLoadError = err
		return
	}
	if len(data) > 16*1024*1024 {
		server.agentSessionsLoadError = fmt.Errorf("agent session store is too large")
		return
	}
	var saved map[string]agentSessionScope
	if err := json.Unmarshal(data, &saved); err != nil {
		server.agentSessionsLoadError = err
		return
	}
	for id, session := range saved {
		if sourceBookPattern.MatchString(id) && len(session.Token) >= 24 {
			server.agentSessions[id] = session
		}
	}
	server.cleanupExpiredAgentSessionsLocked(time.Now())
}

func (server *Server) saveAgentSessionsLocked() error {
	if server.agentSessionsLoadError != nil {
		return fmt.Errorf("agent session store could not be read: %w", server.agentSessionsLoadError)
	}
	if err := os.MkdirAll(filepath.Dir(server.agentSessionsPath), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(server.agentSessionsPath), ".agent-sessions-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	encoder := json.NewEncoder(file)
	if err := encoder.Encode(server.agentSessions); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), server.agentSessionsPath); err != nil {
		return err
	}
	// The directory sync makes the rename durable across an abrupt shutdown.
	directory, err := os.Open(filepath.Dir(server.agentSessionsPath))
	if err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	return nil
}

func agentSessionSaveError(err error) error {
	return &apiError{status: http.StatusInternalServerError, code: "AGENT_SESSION_SAVE_FAILED", message: "Sourcebook could not save this Agent page connection: " + err.Error()}
}

func agentPageLinkCode(token string) string {
	digest := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(digest[:16])
}

func (server *Server) openAgentPageLink(response http.ResponseWriter, request *http.Request) error {
	if request.Method != http.MethodGet {
		return &apiError{status: http.StatusNotFound, code: "AGENT_PAGE_LINK_NOT_FOUND", message: "Sourcebook page link was not found."}
	}
	code := strings.TrimPrefix(request.URL.Path, "/p/")
	server.agentSessionMu.Lock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	var sessionID, pageToken, agentName, bookID string
	for id, session := range server.agentSessions {
		for _, token := range append([]string{session.Token, session.PendingToken}, session.RetiredTokens...) {
			if token == "" {
				continue
			}
			if subtle.ConstantTimeCompare([]byte(code), []byte(agentPageLinkCode(token))) == 1 {
				sessionID, pageToken, agentName, bookID = id, token, session.AgentName, session.BookID
				break
			}
		}
		if sessionID != "" {
			break
		}
	}
	server.agentSessionMu.Unlock()
	if sessionID == "" {
		return &apiError{status: http.StatusNotFound, code: "AGENT_PAGE_LINK_NOT_FOUND", message: "This Sourcebook page link is no longer available. Ask the Agent to open Sourcebook again."}
	}
	query := url.Values{}
	for _, name := range []string{"bookId", "panel", "batchId"} {
		if value := request.URL.Query().Get(name); value != "" {
			query.Set(name, value)
		}
	}
	if query.Get("bookId") == "" && bookID != "" {
		query.Set("bookId", bookID)
	}
	query.Set("agentSession", sessionID)
	query.Set("agentSessionToken", pageToken)
	query.Set("sourcebookHost", strings.ToLower(agentName))
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(response, request, "/?"+query.Encode(), http.StatusFound)
	return nil
}

func (server *Server) registerAgentSession(response http.ResponseWriter, request *http.Request) error {
	payload, err := readBody(request)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(stringValue(payload["sessionId"]))
	token := strings.TrimSpace(stringValue(payload["pageToken"]))
	if !sourceBookPattern.MatchString(id) || len(token) < 24 {
		return &apiError{status: http.StatusBadRequest, code: "AGENT_SESSION_INVALID", message: "Agent session details are invalid."}
	}
	bookID := strings.TrimSpace(stringValue(payload["bookId"]))
	if bookID != "" {
		if _, err := server.context(bookID, true); err != nil {
			return err
		}
	}
	ownerID := strings.TrimSpace(request.Header.Get("X-Sourcebook-Owner"))
	server.agentSessionMu.Lock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	previous, existed := server.agentSessions[id]
	if existed && previous.OwnerID != "" && ownerID != previous.OwnerID {
		server.agentSessionMu.Unlock()
		return &apiError{status: http.StatusForbidden, code: "AGENT_SESSION_OWNER_MISMATCH", message: "This Sourcebook page belongs to a different Agent conversation."}
	}
	// A replacement keeps the same session ID and rotates only its token. A
	// different session owned by the same host conversation is not a replacement:
	// hosts can briefly recreate helpers or panels while restoring a chat.
	// Re-registering must never discard the current scope.
	if bookID == "" {
		bookID = previous.BookID
	}
	next := previous
	next.AgentName = truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80)
	next.OwnerID = ownerID
	if previous.Token == "" {
		next.Token = token
		next.BookID = bookID
	} else if previous.Token != token {
		// A requested new page is only a candidate. Keep the old page usable
		// until the new browser instance actually loads and claims its token.
		next.PendingToken = token
		next.PendingAt = time.Now()
		next.PendingBookID = bookID
	}
	next.Revision++
	next.UpdatedAt = time.Now()
	server.agentSessions[id] = next
	if err := server.saveAgentSessionsLocked(); err != nil {
		if existed {
			server.agentSessions[id] = previous
		} else {
			delete(server.agentSessions, id)
		}
		server.agentSessionMu.Unlock()
		return agentSessionSaveError(err)
	}
	server.agentSessionMu.Unlock()
	writeJSON(response, http.StatusOK, map[string]any{"sessionId": id, "bookId": bookID})
	return nil
}

func (server *Server) readAgentSession(response http.ResponseWriter, request *http.Request, id string) error {
	session, ok := server.agentSession(id)
	if !ok {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "This Sourcebook page is no longer connected to the current Agent session."}
	}
	ownerID := strings.TrimSpace(request.Header.Get("X-Sourcebook-Owner"))
	if session.OwnerID != "" && subtle.ConstantTimeCompare([]byte(ownerID), []byte(session.OwnerID)) != 1 {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page belongs to a different Agent conversation."}
	}
	writeJSON(response, http.StatusOK, agentSessionPayload(id, session, true))
	return nil
}

func (server *Server) readActiveAgentSession(response http.ResponseWriter, request *http.Request) error {
	ownerID := strings.TrimSpace(request.Header.Get("X-Sourcebook-Owner"))
	if ownerID == "" {
		return &apiError{status: http.StatusBadRequest, code: "AGENT_SESSION_OWNER_REQUIRED", message: "This Agent host did not provide a recoverable conversation identity."}
	}
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	var newestID string
	var newest agentSessionScope
	for id, session := range server.agentSessions {
		if subtle.ConstantTimeCompare([]byte(ownerID), []byte(session.OwnerID)) == 1 && (newestID == "" || session.UpdatedAt.After(newest.UpdatedAt)) {
			newestID, newest = id, session
		}
	}
	if newestID != "" {
		writeJSON(response, http.StatusOK, map[string]any{"session": agentSessionPayload(newestID, newest, true)})
		return nil
	}
	writeJSON(response, http.StatusOK, map[string]any{"session": nil})
	return nil
}

func agentSessionPayload(id string, session agentSessionScope, includeToken bool) map[string]any {
	payload := map[string]any{"sessionId": id, "bookId": session.BookID, "selectedSourceIds": session.SelectedSourceIDs, "filteredSourceIds": session.FilteredSourceIDs, "filters": session.Filters, "revision": session.Revision}
	if session.PageInstanceID == "" {
		payload["pageState"] = "unclaimed"
	} else {
		payload["pageState"] = "active"
	}
	if includeToken {
		payload["pageToken"] = session.Token
	}
	return payload
}

func (server *Server) routeBrowserAgentSession(response http.ResponseWriter, request *http.Request) error {
	parts := strings.Split(strings.Trim(request.URL.Path, "/"), "/")
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "agent-sessions" || !sourceBookPattern.MatchString(parts[2]) {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "Agent session endpoint was not found."}
	}
	sessionID := parts[2]
	action := parts[3]
	if (action == "scope" && request.Method != http.MethodPut && request.Method != http.MethodGet) || ((action == "reconnect" || action == "bind") && request.Method != http.MethodPost) || (action != "scope" && action != "reconnect" && action != "bind") {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "Agent session endpoint was not found."}
	}
	payload := map[string]any{}
	if request.Method == http.MethodPut || request.Method == http.MethodPost {
		var err error
		payload, err = readBody(request)
		if err != nil {
			return err
		}
	} else {
		payload["pageToken"] = request.URL.Query().Get("pageToken")
	}
	pageToken := strings.TrimSpace(stringValue(payload["pageToken"]))
	pageInstanceID := strings.TrimSpace(stringValue(payload["pageInstanceId"]))
	if request.Method == http.MethodGet {
		pageInstanceID = strings.TrimSpace(request.URL.Query().Get("pageInstanceId"))
	}
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[sessionID]
	if action == "bind" && !ok {
		// A live tab may outlast an older Desktop's memory-only session. Only
		// an explicit request from the target Agent plus the tab's current Book
		// can establish a new session; never borrow Desktop's default Book.
		code := strings.TrimSpace(stringValue(payload["code"]))
		server.cleanupAgentPageBindingsLocked(time.Now())
		binding, exists := server.agentPageBindings[code]
		bookID := strings.TrimSpace(stringValue(payload["bookId"]))
		if !exists || len(pageToken) < 24 || pageInstanceID == "" || bookID == "" || !strings.EqualFold(binding.AgentName, strings.TrimSpace(stringValue(payload["agentName"]))) {
			return &apiError{status: http.StatusConflict, code: "AGENT_PAGE_SCOPE_REQUIRED", message: "This page needs its current Book and a matching Agent connection request to restore the conversation."}
		}
		if _, err := server.context(bookID, true); err != nil {
			return err
		}
		session = agentSessionScope{Token: pageToken, AgentName: binding.AgentName, OwnerID: binding.OwnerID, BookID: bookID, PageInstanceID: pageInstanceID, SelectedSourceIDs: boundedStringSlice(payload["selectedSourceIds"], 500), FilteredSourceIDs: boundedStringSlice(payload["filteredSourceIds"], 500), Revision: 1, UpdatedAt: time.Now()}
		if filters, valid := payload["filters"].(map[string]any); valid {
			session.Filters = filters
		}
		server.agentSessions[sessionID] = session
		if err := server.saveAgentSessionsLocked(); err != nil {
			delete(server.agentSessions, sessionID)
			return agentSessionSaveError(err)
		}
		delete(server.agentPageBindings, code)
		writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
		return nil
	}
	if !ok {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	if action == "bind" {
		code := strings.TrimSpace(stringValue(payload["code"]))
		server.cleanupAgentPageBindingsLocked(time.Now())
		binding, exists := server.agentPageBindings[code]
		if !exists || !strings.EqualFold(binding.AgentName, session.AgentName) {
			return &apiError{status: http.StatusNotFound, code: "AGENT_PAGE_BINDING_NOT_FOUND", message: "This Agent connection request has expired or belongs to another host."}
		}
		if pageInstanceID == "" || (pageToken != session.Token && pageToken != session.PendingToken && !containsAgentSessionToken(session.RetiredTokens, pageToken)) {
			return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This page cannot authorize the Agent connection."}
		}
		previous := session
		if pageToken != session.Token {
			session.RetiredTokens = appendUniqueString(removeAgentSessionToken(session.RetiredTokens, pageToken), session.Token)
			session.Token = pageToken
		}
		session.OwnerID = binding.OwnerID
		session.PageInstanceID = pageInstanceID
		session.PendingToken = ""
		session.PendingAt = time.Time{}
		session.PendingBookID = ""
		session.Revision++
		session.UpdatedAt = time.Now()
		server.agentSessions[sessionID] = session
		if err := server.saveAgentSessionsLocked(); err != nil {
			server.agentSessions[sessionID] = previous
			return agentSessionSaveError(err)
		}
		delete(server.agentPageBindings, code)
		writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
		return nil
	}
	if action == "reconnect" {
		if pageInstanceID == "" && session.PageInstanceID != "" {
			return &apiError{status: http.StatusConflict, code: "AGENT_PAGE_INSTANCE_REQUIRED", message: "This Sourcebook tab needs a page identity to take over the connection."}
		}
		if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 && subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.PendingToken)) != 1 && !containsAgentSessionToken(session.RetiredTokens, pageToken) {
			return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
		}
		previous := session
		if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
			session.RetiredTokens = appendUniqueString(removeAgentSessionToken(session.RetiredTokens, pageToken), session.Token)
			session.Token = pageToken
			if session.PendingToken == pageToken && session.PendingBookID != "" {
				if session.BookID != session.PendingBookID {
					session.SelectedSourceIDs = nil
					session.FilteredSourceIDs = nil
					session.Filters = nil
				}
				session.BookID = session.PendingBookID
			}
		}
		session.PendingToken = ""
		session.PendingAt = time.Time{}
		session.PendingBookID = ""
		if pageInstanceID != "" {
			session.PageInstanceID = pageInstanceID
		}
		session.Revision++
		session.UpdatedAt = time.Now()
		server.agentSessions[sessionID] = session
		if err := server.saveAgentSessionsLocked(); err != nil {
			server.agentSessions[sessionID] = previous
			return agentSessionSaveError(err)
		}
		writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
		return nil
	}
	if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.PendingToken)) == 1 && pageToken != "" {
		if request.Method != http.MethodGet {
			return &apiError{status: http.StatusConflict, code: "AGENT_PAGE_PENDING", message: "This new page must claim its connection before changing the Agent scope."}
		}
		result := agentSessionPayload(sessionID, session, false)
		result["pageState"] = "pending"
		writeJSON(response, http.StatusOK, result)
		return nil
	}
	if containsAgentSessionToken(session.RetiredTokens, pageToken) {
		if request.Method == http.MethodGet {
			result := agentSessionPayload(sessionID, session, false)
			result["pageState"] = "replaced"
			writeJSON(response, http.StatusOK, result)
			return nil
		}
		return &apiError{status: http.StatusGone, code: "AGENT_SESSION_REPLACED", message: "This Sourcebook page was replaced by a newer page for this Agent conversation."}
	}
	if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	if request.Method == http.MethodGet {
		result := agentSessionPayload(sessionID, session, false)
		if session.PageInstanceID == "" {
			result["pageState"] = "unclaimed"
		} else if pageInstanceID == session.PageInstanceID {
			result["pageState"] = "active"
		} else {
			result["pageState"] = "observer"
		}
		writeJSON(response, http.StatusOK, result)
		return nil
	}
	if session.PageInstanceID != "" && pageInstanceID != session.PageInstanceID {
		return &apiError{status: http.StatusConflict, code: "AGENT_PAGE_NOT_OWNER", message: "Another Sourcebook tab is currently connected to this Agent conversation."}
	}
	previous := session
	bookID := strings.TrimSpace(stringValue(payload["bookId"]))
	if bookID != "" {
		if _, err := server.context(bookID, true); err != nil {
			return err
		}
	}
	session.BookID = bookID
	session.SelectedSourceIDs = boundedStringSlice(payload["selectedSourceIds"], 500)
	session.FilteredSourceIDs = boundedStringSlice(payload["filteredSourceIds"], 500)
	if filters, ok := payload["filters"].(map[string]any); ok {
		session.Filters = filters
	} else {
		session.Filters = nil
	}
	session.Revision++
	session.UpdatedAt = time.Now()
	server.agentSessions[sessionID] = session
	if err := server.saveAgentSessionsLocked(); err != nil {
		server.agentSessions[sessionID] = previous
		return agentSessionSaveError(err)
	}
	writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
	return nil
}

func boundedStringSlice(value any, maximum int) []string {
	values, ok := value.([]any)
	if !ok {
		return nil
	}
	seen := map[string]bool{}
	output := make([]string, 0, len(values))
	for _, value := range values {
		item := strings.TrimSpace(stringValue(value))
		if item != "" && !seen[item] {
			seen[item] = true
			output = append(output, item)
			if len(output) == maximum {
				break
			}
		}
	}
	return output
}

func appendUniqueString(values []string, next string) []string {
	if containsAgentSessionToken(values, next) {
		return values
	}
	values = append(values, next)
	if len(values) > 32 {
		values = append([]string(nil), values[len(values)-32:]...)
	}
	return values
}

func containsAgentSessionToken(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func removeAgentSessionToken(values []string, target string) []string {
	result := values[:0]
	for _, value := range values {
		if value != target {
			result = append(result, value)
		}
	}
	return result
}

func (server *Server) agentSession(id string) (agentSessionScope, bool) {
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[id]
	return session, ok
}

// agentSuggestionSessionID validates the page credentials carried by a
// Sourcebook browser request before exposing or changing Agent proposals.
// Empty credentials deliberately mean a normal Desktop page, which can only
// see legacy/unbound proposals; a connected Agent page sees only its own.
func (server *Server) agentSuggestionSessionID(request *http.Request) (string, error) {
	id := strings.TrimSpace(request.URL.Query().Get("agentSession"))
	token := strings.TrimSpace(request.URL.Query().Get("agentSessionToken"))
	if id == "" && token == "" {
		return "", nil
	}
	if !sourceBookPattern.MatchString(id) || token == "" {
		return "", &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[id]
	if !ok || subtle.ConstantTimeCompare([]byte(token), []byte(session.Token)) != 1 {
		if ok && containsAgentSessionToken(session.RetiredTokens, token) {
			return "", &apiError{status: http.StatusGone, code: "AGENT_SESSION_REPLACED", message: "This Sourcebook page was replaced by a newer page for this Agent conversation."}
		}
		return "", &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	return id, nil
}

// mcpProposalSessionID ensures a proposal can be attributed only to the
// current page of the same host conversation. It never accepts a session ID
// by itself, which prevents a helper from assigning a proposal to another
// conversation's review queue.
func (server *Server) mcpProposalSessionID(request *http.Request) (string, error) {
	id := strings.TrimSpace(request.Header.Get("X-Sourcebook-Agent-Session"))
	token := strings.TrimSpace(request.Header.Get("X-Sourcebook-Agent-Page-Token"))
	if id == "" && token == "" {
		return "", nil
	}
	if !sourceBookPattern.MatchString(id) || token == "" {
		return "", &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "The proposal is not attached to a current Sourcebook page."}
	}
	ownerID := strings.TrimSpace(request.Header.Get("X-Sourcebook-Owner"))
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[id]
	if !ok || subtle.ConstantTimeCompare([]byte(token), []byte(session.Token)) != 1 || (session.OwnerID != "" && subtle.ConstantTimeCompare([]byte(ownerID), []byte(session.OwnerID)) != 1) {
		return "", &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "The proposal is not attached to this Agent conversation's current Sourcebook page."}
	}
	return id, nil
}

func (server *Server) authorizeSuggestionRequest(request *http.Request, suggestionSessionID string) error {
	requestSessionID, err := server.agentSuggestionSessionID(request)
	if err != nil {
		return err
	}
	if requestSessionID != suggestionSessionID {
		return &apiError{status: http.StatusNotFound, code: "MCP_SUGGESTION_NOT_FOUND", message: "This Agent submission is not available in this Sourcebook page."}
	}
	return nil
}

func (server *Server) cleanupExpiredAgentSessionsLocked(now time.Time) {
	for id, session := range server.agentSessions {
		if session.PendingToken != "" && now.Sub(session.PendingAt) > 5*time.Minute {
			session.PendingToken = ""
			session.PendingAt = time.Time{}
			session.PendingBookID = ""
			server.agentSessions[id] = session
		}
	}
}
