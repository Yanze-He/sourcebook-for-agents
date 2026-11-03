package main

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"
)

// agentSessionScope is intentionally memory-only. It connects one local MCP
// stdio process to the one browser page it opened; it is not a cross-device
// identity, and disappears when Desktop restarts.
type agentSessionScope struct {
	Token         string
	RetiredTokens []string
	AgentName     string
	OwnerID       string
	Retired       bool
	// ActivePageInstanceID identifies the one browser view allowed to write
	// this session's scope. A browser tab is not an MCP session: users can
	// duplicate a URL, so the page itself supplies this short-lived ID.
	ActivePageInstanceID string
	BookID               string
	SelectedSourceIDs    []string
	FilteredSourceIDs    []string
	Filters              map[string]any
	Revision             int
	UpdatedAt            time.Time
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
	// A different session id for the same owner is an explicit page
	// replacement (for example, reconnect after a host discarded its panel).
	// Keep a short-lived tombstone rather than deleting the old record. A
	// WorkBuddy panel can be frozen while replaced; when it resumes, its first
	// scope check must receive a deterministic disconnected response.
	if ownerID != "" {
		if _, replacingCurrentID := server.agentSessions[id]; !replacingCurrentID {
			for existingID, existing := range server.agentSessions {
				if subtle.ConstantTimeCompare([]byte(ownerID), []byte(existing.OwnerID)) == 1 {
					existing.Retired = true
					existing.UpdatedAt = time.Now()
					server.agentSessions[existingID] = existing
				}
			}
		}
	}
	previous := server.agentSessions[id]
	// Re-registering a page (including a deliberate replacement) must never
	// discard its current scope. The fresh page token is the only value that
	// changes; old browser pages then receive 401 and show their disconnect UI.
	if bookID == "" {
		bookID = previous.BookID
	}
	retiredTokens := previous.RetiredTokens
	activePageInstanceID := previous.ActivePageInstanceID
	if previous.Token != "" && previous.Token != token {
		retiredTokens = appendUniqueString(retiredTokens, previous.Token)
		// A deliberate page replacement has a new browser view. It must become
		// the first page eligible to claim the scope.
		activePageInstanceID = ""
	}
	server.agentSessions[id] = agentSessionScope{Token: token, RetiredTokens: retiredTokens, AgentName: truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80), OwnerID: ownerID, ActivePageInstanceID: activePageInstanceID, BookID: bookID, SelectedSourceIDs: previous.SelectedSourceIDs, FilteredSourceIDs: previous.FilteredSourceIDs, Filters: previous.Filters, Revision: previous.Revision + 1, UpdatedAt: time.Now()}
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
	for id, session := range server.agentSessions {
		if !session.Retired && subtle.ConstantTimeCompare([]byte(ownerID), []byte(session.OwnerID)) == 1 {
			writeJSON(response, http.StatusOK, map[string]any{"session": agentSessionPayload(id, session, true)})
			return nil
		}
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
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "agent-sessions" || !sourceBookPattern.MatchString(parts[2]) || parts[3] != "scope" || (request.Method != http.MethodPut && request.Method != http.MethodGet) {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "Agent session endpoint was not found."}
	}
	sessionID := parts[2]
	payload := map[string]any{}
	if request.Method == http.MethodPut {
		var err error
		payload, err = readBody(request)
		if err != nil {
			return err
		}
	} else {
		payload["pageToken"] = request.URL.Query().Get("pageToken")
		payload["pageInstanceId"] = request.URL.Query().Get("pageInstanceId")
	}
	pageToken := strings.TrimSpace(stringValue(payload["pageToken"]))
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[sessionID]
	if !ok {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	if session.Retired || containsAgentSessionToken(session.RetiredTokens, pageToken) {
		return &apiError{status: http.StatusGone, code: "AGENT_SESSION_REPLACED", message: "This Sourcebook page was replaced by a newer page for this Agent conversation."}
	}
	if subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	pageInstanceID := strings.TrimSpace(stringValue(payload["pageInstanceId"]))
	if pageInstanceID != "" && !sourceBookPattern.MatchString(pageInstanceID) {
		return &apiError{status: http.StatusBadRequest, code: "AGENT_PAGE_INSTANCE_INVALID", message: "This Sourcebook page identity is invalid."}
	}
	if request.Method == http.MethodGet {
		result := agentSessionPayload(sessionID, session, false)
		result["isActivePage"] = pageInstanceID != "" && subtle.ConstantTimeCompare([]byte(pageInstanceID), []byte(session.ActivePageInstanceID)) == 1
		writeJSON(response, http.StatusOK, result)
		return nil
	}
	// A duplicate browser tab is a second view of the same Agent session, not
	// another Agent context. The first page becomes active; a passive page may
	// take ownership only through a direct user action (claim=true). In
	// particular, the normal background sync can never win a timing race.
	if pageInstanceID != "" {
		if session.ActivePageInstanceID == "" || boolValue(payload["claim"]) {
			session.ActivePageInstanceID = pageInstanceID
		}
		if subtle.ConstantTimeCompare([]byte(pageInstanceID), []byte(session.ActivePageInstanceID)) != 1 {
			result := agentSessionPayload(sessionID, session, false)
			result["isActivePage"] = false
			writeJSON(response, http.StatusOK, result)
			return nil
		}
	} else if session.ActivePageInstanceID != "" {
		// Old Sources pages can still authenticate with the URL token, but cannot
		// overwrite a newer client that understands page ownership.
		result := agentSessionPayload(sessionID, session, false)
		result["isActivePage"] = false
		writeJSON(response, http.StatusOK, result)
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
	result := agentSessionPayload(sessionID, session, false)
	result["isActivePage"] = true
	writeJSON(response, http.StatusOK, result)
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

func (server *Server) agentSession(id string) (agentSessionScope, bool) {
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[id]
	return session, ok
}

func (server *Server) cleanupExpiredAgentSessionsLocked(now time.Time) {
	for id, session := range server.agentSessions {
		if now.Sub(session.UpdatedAt) > 12*time.Hour {
			delete(server.agentSessions, id)
		}
	}
}
