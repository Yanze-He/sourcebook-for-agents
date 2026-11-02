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
	Token             string
	AgentName         string
	OwnerID           string
	BookID            string
	SelectedSourceIDs []string
	FilteredSourceIDs []string
	Filters           map[string]any
	Revision          int
	UpdatedAt         time.Time
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
	// Retire the old record so its browser poll receives a disconnected state
	// and future helper restarts can only recover the new page.
	if ownerID != "" {
		if _, replacingCurrentID := server.agentSessions[id]; !replacingCurrentID {
			for existingID, existing := range server.agentSessions {
				if subtle.ConstantTimeCompare([]byte(ownerID), []byte(existing.OwnerID)) == 1 {
					delete(server.agentSessions, existingID)
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
	server.agentSessions[id] = agentSessionScope{Token: token, AgentName: truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80), OwnerID: ownerID, BookID: bookID, SelectedSourceIDs: previous.SelectedSourceIDs, FilteredSourceIDs: previous.FilteredSourceIDs, Filters: previous.Filters, Revision: previous.Revision + 1, UpdatedAt: time.Now()}
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
		if subtle.ConstantTimeCompare([]byte(ownerID), []byte(session.OwnerID)) == 1 {
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
	}
	pageToken := strings.TrimSpace(stringValue(payload["pageToken"]))
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[sessionID]
	if !ok || subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
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
