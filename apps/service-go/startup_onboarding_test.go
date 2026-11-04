package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAgentOnboardingAppearsOncePerMacBuild(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Sourcebook Library")
	library, err := OpenLibrary(root, "", filepath.Join(filepath.Dir(root), "library-location.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	previousVersion, previousBuild := appVersion, appBuild
	appVersion, appBuild = "0.1.5", "mac.089"
	t.Cleanup(func() { appVersion, appBuild = previousVersion, previousBuild })
	server := NewServer(library, "")
	claim := func(version string) bool {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/settings/agent-onboarding/claim?desktop="+version, nil)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("claim status = %d: %s", response.Code, response.Body.String())
		}
		var result struct {
			ShowAgentConnect bool `json:"showAgentConnect"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.ShowAgentConnect
	}
	if claim("diagnostic") {
		t.Fatal("a non-Desktop page claimed onboarding")
	}
	if first := claim("0.1.5"); first != (runtime.GOOS == "darwin") {
		t.Fatalf("first claim = %v on %s", first, runtime.GOOS)
	}
	if claim("0.1.5") {
		t.Fatal("the same build repeated the connection prompt")
	}
	if runtime.GOOS == "darwin" {
		appBuild = "mac.090"
		if !claim("0.1.5") {
			t.Fatal("a newer Desktop build did not show the connection prompt")
		}
	}
}
