package main

import (
	"errors"
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
