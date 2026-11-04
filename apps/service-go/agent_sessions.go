package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
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
		for _, token := range append([]string{session.Token}, session.RetiredTokens...) {
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
	previous := server.agentSessions[id]
	// A replacement keeps the same session ID and rotates only its token. A
	// different session owned by the same host conversation is not a replacement:
	// hosts can briefly recreate helpers or panels while restoring a chat.
	// Re-registering must never discard the current scope.
	if bookID == "" {
		bookID = previous.BookID
	}
	retiredTokens := previous.RetiredTokens
	if previous.Token != "" && previous.Token != token {
		retiredTokens = appendUniqueString(retiredTokens, previous.Token)
	}
	server.agentSessions[id] = agentSessionScope{Token: token, RetiredTokens: retiredTokens, AgentName: truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80), OwnerID: ownerID, BookID: bookID, SelectedSourceIDs: previous.SelectedSourceIDs, FilteredSourceIDs: previous.FilteredSourceIDs, Filters: previous.Filters, Revision: previous.Revision + 1, UpdatedAt: time.Now()}
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
	writeJSON(response, http.StatusOK, agentSessionPayload(id, session, false))
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
	if (action == "scope" && request.Method != http.MethodPut && request.Method != http.MethodGet) || (action == "reconnect" && request.Method != http.MethodPost) || (action != "scope" && action != "reconnect") {
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
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[sessionID]
	if !ok {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	if action == "reconnect" {
		if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 && !containsAgentSessionToken(session.RetiredTokens, pageToken) {
			return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
		}
		if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
			session.RetiredTokens = appendUniqueString(removeAgentSessionToken(session.RetiredTokens, pageToken), session.Token)
			session.Token = pageToken
		}
		session.Revision++
		session.UpdatedAt = time.Now()
		server.agentSessions[sessionID] = session
		writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
		return nil
	}
	if containsAgentSessionToken(session.RetiredTokens, pageToken) {
		return &apiError{status: http.StatusGone, code: "AGENT_SESSION_REPLACED", message: "This Sourcebook page was replaced by a newer page for this Agent conversation."}
	}
	if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	if request.Method == http.MethodGet {
		writeJSON(response, http.StatusOK, agentSessionPayload(sessionID, session, false))
		return nil
	}
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
	return append(values, next)
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
		if now.Sub(session.UpdatedAt) > 12*time.Hour {
			delete(server.agentSessions, id)
		}
	}
}
