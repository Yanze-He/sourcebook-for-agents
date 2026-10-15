package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestLibrarySettingsRequireFirstConfirmation(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Sourcebook Library")
	library, err := OpenLibrary(root, "", filepath.Join(filepath.Dir(root), "library-location.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	request := httptest.NewRequest(http.MethodGet, "/api/settings/library", nil)
	request.Host = "127.0.0.1:4177"
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	var before struct {
		RequiresSetup bool `json:"requiresSetup"`
		IsEmpty       bool `json:"isEmpty"`
	}
	if err := json.NewDecoder(response.Body).Decode(&before); err != nil {
		t.Fatal(err)
	}
	if !before.RequiresSetup {
		t.Fatal("new library should require confirmation")
	}
	if !before.IsEmpty {
		t.Fatal("new library should be treated as empty for first-run onboarding")
	}
	confirm := httptest.NewRequest(http.MethodPut, "/api/settings/library", bytes.NewBufferString(`{"destination":"`+root+`"}`))
	confirm.Host = "127.0.0.1:4177"
	confirm.Header.Set("content-type", "application/json")
	confirmed := httptest.NewRecorder()
	server.ServeHTTP(confirmed, confirm)
	if confirmed.Code != http.StatusOK {
		t.Fatalf("confirmation status = %d: %s", confirmed.Code, confirmed.Body.String())
	}
	var after struct {
		RequiresSetup bool `json:"requiresSetup"`
	}
	if err := json.NewDecoder(confirmed.Body).Decode(&after); err != nil {
		t.Fatal(err)
	}
	if after.RequiresSetup {
		t.Fatal("confirmed location should not require setup")
	}
}

func TestLibrarySettingsTreatsAdditionalBooksAsExistingData(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Sourcebook Library")
	library, err := OpenLibrary(root, "", filepath.Join(filepath.Dir(root), "library-location.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	if _, err := library.CreateBook("Research"); err != nil {
		t.Fatal(err)
	}
	server := NewServer(library, "").(*Server)
	request := httptest.NewRequest(http.MethodGet, "/api/settings/library", nil)
	request.Host = "127.0.0.1:4177"
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	var settings struct {
		IsEmpty bool `json:"isEmpty"`
	}
	if err := json.NewDecoder(response.Body).Decode(&settings); err != nil {
		t.Fatal(err)
	}
	if settings.IsEmpty {
		t.Fatal("a library with an additional Book should not use first-run onboarding")
	}
}

func TestVersionComparisonIncludesPreReleases(t *testing.T) {
	if compareVersions("0.2.0-beta.2", "0.1.9") <= 0 {
		t.Fatal("newer pre-release should compare above older stable")
	}
	if compareVersions("0.2.0", "0.2.0-beta.9") <= 0 {
		t.Fatal("stable should compare above its pre-release")
	}
	if compareVersions("0.2.0-beta.2", "0.2.0-beta.10") >= 0 {
		t.Fatal("pre-release labels should retain a deterministic ascending order")
	}
}

func TestWindowsFolderChooserUsesUTF8Output(t *testing.T) {
	script := windowsFolderChooserScript(`C:\Users\测试\Documents`)
	for _, expected := range []string{"UTF8Encoding", "[Console]::OutputEncoding=$utf8", "C:\\Users\\测试\\Documents", "[Console]::Out.Write($dialog.SelectedPath)"} {
		if !strings.Contains(script, expected) {
			t.Fatalf("Windows folder chooser script is missing %q: %s", expected, script)
		}
	}
}
