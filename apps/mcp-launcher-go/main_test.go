package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestCurrentDesktopMCPUsesOnlyMarkerProvidedDesktopHelper(t *testing.T) {
	data := t.TempDir()
	t.Setenv("SOURCEBOOK_DATA_DIR", data)
	name := "sourcebook-mcp"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	root := t.TempDir()
	path := filepath.Join(root, "Sourcebook Desktop.app", "Contents", "Resources", name)
	if runtime.GOOS == "windows" {
		path = filepath.Join(root, name)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("helper"), 0o700); err != nil {
		t.Fatal(err)
	}
	marker, _ := json.Marshal(map[string]string{"mcpPath": path})
	if err := os.WriteFile(filepath.Join(data, "desktop-install.json"), marker, 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := currentDesktopMCP(); err != nil || got != path {
		t.Fatalf("currentDesktopMCP = %q, %v", got, err)
	}
	if err := os.WriteFile(filepath.Join(data, "desktop-install.json"), []byte(`{"mcpPath":"/tmp/not-sourcebook"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := currentDesktopMCP(); err == nil {
		t.Fatal("untrusted marker helper path was accepted")
	}
}
