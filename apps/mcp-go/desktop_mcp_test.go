package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallCodexMCPAddsStableLauncherAndPreservesUserConfig(t *testing.T) {
	launcher := "/Users/example/Library/Application Support/Sourcebook for Agents/sourcebook-mcp-launcher"
	calls := []string{}
	run := func(args ...string) ([]byte, error) {
		call := strings.Join(args, " ")
		calls = append(calls, call)
		switch call {
		case "mcp get sourcebook --json":
			if len(calls) == 1 {
				return []byte("not found"), errors.New("not found")
			}
			return []byte(`{"transport":{"type":"stdio","command":"/Users/example/Library/Application Support/Sourcebook for Agents/sourcebook-mcp-launcher","args":[],"env":{"SOURCEBOOK_AGENT_NAME":"Codex"}}}`), nil
		case "mcp add sourcebook --env SOURCEBOOK_AGENT_NAME=Codex -- /Users/example/Library/Application Support/Sourcebook for Agents/sourcebook-mcp-launcher":
			return nil, nil
		}
		return nil, errors.New("unexpected command")
	}
	if err := installCodexMCP(run, launcher); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"mcp get sourcebook --json",
		"mcp add sourcebook --env SOURCEBOOK_AGENT_NAME=Codex -- /Users/example/Library/Application Support/Sourcebook for Agents/sourcebook-mcp-launcher",
		"mcp get sourcebook --json",
	}
	if strings.Join(calls, "\n") != strings.Join(want, "\n") {
		t.Fatalf("calls = %#v, want %#v", calls, want)
	}
	userConfig := func(args ...string) ([]byte, error) {
		if strings.Join(args, " ") == "mcp get sourcebook --json" {
			return []byte(`{"transport":{"type":"stdio","command":"/usr/local/bin/my-sourcebook","args":[],"env":{}}}`), nil
		}
		t.Fatalf("user configuration must not be changed: %q", strings.Join(args, " "))
		return nil, nil
	}
	if err := installCodexMCP(userConfig, launcher); err == nil || !strings.Contains(err.Error(), "not managed") {
		t.Fatalf("user configuration result = %v", err)
	}
}

func TestCodexConnectionStatusUsesOnlyDesktopOwnedEntries(t *testing.T) {
	data := t.TempDir()
	t.Setenv("SOURCEBOOK_DATA_DIR", data)
	launcher := filepath.Join(data, "sourcebook-mcp-launcher")
	if err := os.WriteFile(launcher, []byte("launcher"), 0o700); err != nil {
		t.Fatal(err)
	}
	legacy := filepath.Join(data, "sourcebook-mcp")
	marker, err := json.Marshal(map[string]string{"launcherPath": launcher, "mcpPath": legacy})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(data, "desktop-install.json"), marker, 0o600); err != nil {
		t.Fatal(err)
	}
	run := func(output string, err error) codexCommandRunner {
		return func(args ...string) ([]byte, error) {
			if got := strings.Join(args, " "); got != "mcp get sourcebook --json" {
				t.Fatalf("command = %q", got)
			}
			return []byte(output), err
		}
	}
	if got := codexConnectionStatus(run("not found", errors.New("not found"))); got.Status != "not_connected" {
		t.Fatalf("not found status = %#v", got)
	}
	if got := codexConnectionStatus(run(`{"transport":{"command":"/usr/local/bin/user-sourcebook","env":{}}}`, nil)); got.Status != "protected" {
		t.Fatalf("user configuration status = %#v", got)
	}
	if got := codexConnectionStatus(run(`{"transport":{"command":"`+legacy+`","env":{"SOURCEBOOK_AGENT_NAME":"Codex"}}}`, nil)); got.Status != "repairable" {
		t.Fatalf("legacy configuration status = %#v", got)
	}
	if got := codexConnectionStatus(run(`{"transport":{"command":"`+launcher+`","env":{"SOURCEBOOK_AGENT_NAME":"Codex"}}}`, nil)); got.Status != "connected" {
		t.Fatalf("current configuration status = %#v", got)
	}
}
