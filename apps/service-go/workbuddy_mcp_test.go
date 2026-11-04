package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDesktopManagedWorkBuddyConnectionPreservesOtherServersAndUsesStableLauncher(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
	}
	data := t.TempDir()
	t.Setenv("SOURCEBOOK_DATA_DIR", data)
	launcher := filepath.Join(data, "sourcebook-mcp-launcher")
	if runtime.GOOS == "windows" {
		launcher += ".exe"
	}
	if err := os.WriteFile(launcher, []byte("launcher"), 0o700); err != nil {
		t.Fatal(err)
	}
	marker, _ := json.Marshal(map[string]string{"launcherPath": launcher})
	if err := os.WriteFile(filepath.Join(data, "desktop-install.json"), marker, 0o600); err != nil {
		t.Fatal(err)
	}
	workBuddyDir := filepath.Join(home, ".workbuddy")
	if err := os.MkdirAll(workBuddyDir, 0o700); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(workBuddyDir, "mcp.json")
	if err := os.WriteFile(configPath, []byte(`{"mcpServers":{"other":{"command":"keep-me"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	enable := httptest.NewRecorder()
	if err := server.enableMCP(enable, httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/mcp", nil)); err != nil {
		t.Fatal(err)
	}
	result := httptest.NewRecorder()
	if err := server.setWorkBuddyMCP(result, false); err != nil {
		t.Fatal(err)
	}
	var initialPayload struct {
		WorkBuddy workBuddyMCPStatus `json:"workbuddy"`
	}
	if err := json.Unmarshal(result.Body.Bytes(), &initialPayload); err != nil || initialPayload.WorkBuddy.Status != "awaiting_trust" {
		t.Fatalf("initial trust check = %#v, %v", initialPayload.WorkBuddy, err)
	}
	document, err := readWorkBuddyMCPDocument(configPath)
	if err != nil {
		t.Fatal(err)
	}
	servers := document["mcpServers"].(map[string]any)
	if servers["other"].(map[string]any)["command"] != "keep-me" {
		t.Fatalf("other server was changed: %#v", servers)
	}
	sourcebook := servers["sourcebook"].(map[string]any)
	if sourcebook["command"] != launcher || boolValue(sourcebook["disabled"]) || !isDesktopManagedWorkBuddyConfig(sourcebook) {
		t.Fatalf("Sourcebook WorkBuddy config = %#v", sourcebook)
	}
	if status := server.workBuddyMCPStatus(); status.Status != "awaiting_trust" {
		t.Fatalf("untrusted WorkBuddy status = %#v", status)
	}
	approvalKey, ok := workBuddyMCPApprovalKey(sourcebook)
	if !ok {
		t.Fatalf("approval key was not created for %#v", sourcebook)
	}
	approvals, _ := json.Marshal(map[string]int64{approvalKey: 1})
	if err := os.WriteFile(filepath.Join(workBuddyDir, "mcp-approvals.json"), approvals, 0o600); err != nil {
		t.Fatal(err)
	}
	if status := server.workBuddyMCPStatus(); status.Status != "connected" {
		t.Fatalf("trusted WorkBuddy status = %#v", status)
	}
	trustedResult := httptest.NewRecorder()
	if err := server.setWorkBuddyMCP(trustedResult, false); err != nil {
		t.Fatal(err)
	}
	var trustedPayload struct {
		WorkBuddy workBuddyMCPStatus `json:"workbuddy"`
	}
	if err := json.Unmarshal(trustedResult.Body.Bytes(), &trustedPayload); err != nil || trustedPayload.WorkBuddy.Status != "connected" {
		t.Fatalf("trusted response = %#v, %v", trustedPayload.WorkBuddy, err)
	}
	if err := server.setWorkBuddyMCP(httptest.NewRecorder(), true); err != nil {
		t.Fatal(err)
	}
	document, err = readWorkBuddyMCPDocument(configPath)
	updatedSourcebook, ok := workBuddySourcebookConfig(document)
	if err != nil || !ok || !boolValue(updatedSourcebook["disabled"]) {
		t.Fatalf("WorkBuddy disable = %#v, %v", document, err)
	}
}
