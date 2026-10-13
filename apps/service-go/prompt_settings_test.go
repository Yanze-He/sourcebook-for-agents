package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestPromptSettingsPersistOutsideLibraryData(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Sourcebook Library")
	library, err := OpenLibrary(root, "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)

	put := httptest.NewRequest(http.MethodPut, "/api/settings/prompt", bytes.NewBufferString(`{"template":"Use {{#each files}}{{file_name}}{{/each}}"}`))
	put.Host = "127.0.0.1:4177"
	put.Header.Set("content-type", "application/json")
	putResult := httptest.NewRecorder()
	server.ServeHTTP(putResult, put)
	if putResult.Code != http.StatusOK {
		t.Fatalf("saving prompt settings returned %d: %s", putResult.Code, putResult.Body.String())
	}

	if _, err := library.Reset(); err != nil {
		t.Fatal(err)
	}
	getResult := httptest.NewRecorder()
	get := httptest.NewRequest(http.MethodGet, "/api/settings/prompt", nil)
	get.Host = "127.0.0.1:4177"
	server.ServeHTTP(getResult, get)
	if getResult.Code != http.StatusOK {
		t.Fatalf("reading prompt settings returned %d: %s", getResult.Code, getResult.Body.String())
	}
	var response struct {
		Template string `json:"template"`
	}
	if err := json.NewDecoder(getResult.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Template != "Use {{#each files}}{{file_name}}{{/each}}" {
		t.Fatalf("prompt template was not preserved: %q", response.Template)
	}
}

func TestPromptSettingsCanReturnToDefault(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "Sourcebook Library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)

	request := httptest.NewRequest(http.MethodPut, "/api/settings/prompt", bytes.NewBufferString(`{"template":""}`))
	request.Host = "127.0.0.1:4177"
	request.Header.Set("content-type", "application/json")
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusOK {
		t.Fatalf("restoring default returned %d: %s", result.Code, result.Body.String())
	}
	var response struct {
		Template string `json:"template"`
	}
	if err := json.NewDecoder(result.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Template != "" {
		t.Fatalf("expected no custom template, got %q", response.Template)
	}
}
