package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestLocalAPIAcceptsOnlyDesktopAndBundledPicker(t *testing.T) {
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
		{"bundled picker", "127.0.0.1:4177", "chrome-extension://" + PickerExtensionID, http.MethodGet, http.StatusOK},
		{"picker preflight", "127.0.0.1:4177", "chrome-extension://" + PickerExtensionID, http.MethodOptions, http.StatusNoContent},
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
			if test.origin == "chrome-extension://"+PickerExtensionID && response.Header().Get("Access-Control-Allow-Origin") != test.origin {
				t.Fatalf("CORS origin = %q, want %q", response.Header().Get("Access-Control-Allow-Origin"), test.origin)
			}
		})
	}
}
