package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestWebsiteEntryDoesNotCacheStaleBundleReferences(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	webRoot := t.TempDir()
	if err := os.Mkdir(filepath.Join(webRoot, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webRoot, "index.html"), []byte(`<script type="module" src="/assets/current.js"></script>`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webRoot, "assets", "current.js"), []byte(`export const ready = true;`), 0o644); err != nil {
		t.Fatal(err)
	}
	server := NewServer(library, webRoot)
	request := func(path string) *httptest.ResponseRecorder {
		result := httptest.NewRecorder()
		server.ServeHTTP(result, httptest.NewRequest(http.MethodGet, "http://localhost:4177"+path, nil))
		return result
	}
	entry := request("/")
	if entry.Code != http.StatusOK || entry.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("entry = %d, cache %q", entry.Code, entry.Header().Get("Cache-Control"))
	}
	asset := request("/assets/current.js")
	if asset.Code != http.StatusOK || asset.Header().Get("Content-Type") != "text/javascript; charset=utf-8" {
		t.Fatalf("current bundle = %d, type %q", asset.Code, asset.Header().Get("Content-Type"))
	}
	missing := request("/assets/previous.js")
	if missing.Code != http.StatusNotFound || missing.Body.String() == entry.Body.String() {
		t.Fatalf("missing old bundle = %d: %s", missing.Code, missing.Body.String())
	}
}

func TestLocalAPIAcceptsOnlyDesktopAndApprovedPickerBuilds(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	handler := NewServer(library, "")

	for _, test := range []struct {
		name, host, origin string
		method             string
		want               int
	}{
		{"desktop page", "127.0.0.1:4177", "http://127.0.0.1:4177", http.MethodGet, http.StatusOK},
		{"local picker", "127.0.0.1:4177", "chrome-extension://" + LocalPickerExtensionID, http.MethodGet, http.StatusOK},
		{"store picker", "127.0.0.1:4177", "chrome-extension://" + ChromeWebStorePickerExtensionID, http.MethodGet, http.StatusOK},
		{"picker preflight", "127.0.0.1:4177", "chrome-extension://" + ChromeWebStorePickerExtensionID, http.MethodOptions, http.StatusNoContent},
		{"other extension", "127.0.0.1:4177", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", http.MethodGet, http.StatusForbidden},
		{"foreign website", "127.0.0.1:4177", "https://example.invalid", http.MethodGet, http.StatusForbidden},
		{"forged host", "example.invalid:4177", "", http.MethodGet, http.StatusBadRequest},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, "http://"+test.host+"/api/books", nil)
			request.Host = test.host
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("status = %d, want %d", response.Code, test.want)
			}
			if (test.origin == "chrome-extension://"+LocalPickerExtensionID || test.origin == "chrome-extension://"+ChromeWebStorePickerExtensionID) && response.Header().Get("Access-Control-Allow-Origin") != test.origin {
				t.Fatalf("CORS origin = %q, want %q", response.Header().Get("Access-Control-Allow-Origin"), test.origin)
			}
		})
	}
}

func TestHealthReportsTheBundledDesktopVersion(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4177/api/health", nil)
	request.Host = "127.0.0.1:4177"
	response := httptest.NewRecorder()
	NewServer(library, "").ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var health struct {
		App     string `json:"app"`
		Version string `json:"version"`
	}
	if err := json.NewDecoder(response.Body).Decode(&health); err != nil {
		t.Fatal(err)
	}
	if health.App != "sourcebook-for-agents" {
		t.Fatalf("app = %q", health.App)
	}
	if health.Version != appVersion {
		t.Fatalf("version = %q, want %q", health.Version, appVersion)
	}
}

func TestLegacyBookIDWithSpacesCanActivate(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	manifest, err := library.List()
	if err != nil {
		t.Fatal(err)
	}
	manifest.Books = append(manifest.Books, Book{ID: "sourcebook brand", Name: "Sourcebook brand", Directory: "sourcebook brand"})
	if err := library.writeManifest(manifest); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4177/api/books/sourcebook%20brand/activate", nil)
	request.Host = "127.0.0.1:4177"
	response := httptest.NewRecorder()
	NewServer(library, "").ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var result Manifest
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.ActiveBookID != "sourcebook brand" {
		t.Fatalf("activeBookId = %q", result.ActiveBookID)
	}
}
