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
	Token     string
	AgentName string
	BookID    string
	UpdatedAt time.Time
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
	server.agentSessionMu.Lock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	server.agentSessions[id] = agentSessionScope{Token: token, AgentName: truncate(strings.TrimSpace(stringValue(payload["agentName"])), 80), BookID: bookID, UpdatedAt: time.Now()}
	server.agentSessionMu.Unlock()
	writeJSON(response, http.StatusOK, map[string]any{"sessionId": id, "bookId": bookID})
	return nil
}

func (server *Server) readAgentSession(response http.ResponseWriter, request *http.Request, id string) error {
	session, ok := server.agentSession(id)
	if !ok {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "This Sourcebook page is no longer connected to the current Agent session."}
	}
	writeJSON(response, http.StatusOK, map[string]any{"sessionId": id, "bookId": session.BookID})
	return nil
}

func (server *Server) routeBrowserAgentSession(response http.ResponseWriter, request *http.Request) error {
	parts := strings.Split(strings.Trim(request.URL.Path, "/"), "/")
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "agent-sessions" || !sourceBookPattern.MatchString(parts[2]) || parts[3] != "scope" || request.Method != http.MethodPut {
		return &apiError{status: http.StatusNotFound, code: "AGENT_SESSION_NOT_FOUND", message: "Agent session endpoint was not found."}
	}
	payload, err := readBody(request)
	if err != nil {
		return err
	}
	sessionID := parts[2]
	pageToken := strings.TrimSpace(stringValue(payload["pageToken"]))
	bookID := strings.TrimSpace(stringValue(payload["bookId"]))
	if bookID != "" {
		if _, err := server.context(bookID, true); err != nil {
			return err
		}
	}
	server.agentSessionMu.Lock()
	defer server.agentSessionMu.Unlock()
	server.cleanupExpiredAgentSessionsLocked(time.Now())
	session, ok := server.agentSessions[sessionID]
	if !ok || subtle.ConstantTimeCompare([]byte(pageToken), []byte(session.Token)) != 1 {
		return &apiError{status: http.StatusUnauthorized, code: "AGENT_SESSION_UNAUTHORIZED", message: "This Sourcebook page is not connected to the current Agent session."}
	}
	session.BookID, session.UpdatedAt = bookID, time.Now()
	server.agentSessions[sessionID] = session
	writeJSON(response, http.StatusOK, map[string]any{"sessionId": sessionID, "bookId": bookID})
	return nil
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
