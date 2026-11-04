package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

// Claim the connection prompt once per installed macOS build. Keep this marker
// beside Desktop settings rather than in a browser profile, so opening a second
// browser or an Agent page does not repeat onboarding.
func (server *Server) claimAgentOnboarding(response http.ResponseWriter, request *http.Request) error {
	if runtime.GOOS != "darwin" || request.URL.Query().Get("desktop") != appVersion {
		writeJSON(response, http.StatusOK, map[string]any{"showAgentConnect": false})
		return nil
	}
	server.settingsMu.Lock()
	defer server.settingsMu.Unlock()
	markerPath := filepath.Join(filepath.Dir(server.settingsPath), "agent-onboarding-seen.txt")
	buildKey := appVersion + "|" + appBuild
	lastSeen, err := os.ReadFile(markerPath)
	if err == nil && string(lastSeen) == buildKey {
		writeJSON(response, http.StatusOK, map[string]any{"showAgentConnect": false})
		return nil
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(markerPath), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(markerPath), ".agent-onboarding-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.WriteString(buildKey); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), markerPath); err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"showAgentConnect": true})
	return nil
}
