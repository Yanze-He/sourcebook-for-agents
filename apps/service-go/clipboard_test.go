package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestClipboardImportUsesOneTimeFileSnapshot(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	filePath := filepath.Join(t.TempDir(), "brief.any-extension")
	if err := os.WriteFile(filePath, []byte("arbitrary local file"), 0o600); err != nil {
		t.Fatal(err)
	}
	server.clipboardSnapshots["clipboard-test-token"] = clipboardSnapshot{files: []clipboardSnapshotFile{{id: "native-brief", path: filePath}}, createdAt: time.Now()}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	payload, err := json.Marshal(clipboardImportRequest{Token: "clipboard-test-token", Items: []clipboardImportItem{
		{ID: "item-file", Kind: "native-file", NativeFileID: "native-brief"},
		{ID: "item-link", Kind: "link", Value: "https://example.com/reference"},
		{ID: "item-text", Kind: "text", Value: "Notes copied from the clipboard."},
	}})
	if err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormField("payload")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/books/sourcebook/clipboard-import", body)
	request.Header.Set("content-type", writer.FormDataContentType())
	if err := server.importClipboard(response, request, "sourcebook"); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusCreated {
		t.Fatalf("expected created response, got %d: %s", response.Code, response.Body.String())
	}
	var count int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("expected file, link, and text sources, got %d", count)
	}
	entries, err := os.ReadDir(ctx.MediaRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one managed file, got %d", len(entries))
	}

}

func TestClipboardImportStreamsBrowserFile(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	payload, err := json.Marshal(clipboardImportRequest{Items: []clipboardImportItem{{ID: "browser-file", Kind: "browser-file"}}})
	if err != nil {
		t.Fatal(err)
	}
	meta, err := writer.CreateFormField("payload")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := meta.Write(payload); err != nil {
		t.Fatal(err)
	}
	file, err := writer.CreateFormFile("file-browser-file", "large-reference.bin")
	if err != nil {
		t.Fatal(err)
	}
	// This is deliberately larger than the former 30 MiB JSON-body ceiling.
	// Multipart must reach the Book without holding a base64 request in memory.
	if _, err := file.Write(bytes.Repeat([]byte("sourcebook"), 4*1024*1024)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/books/sourcebook/clipboard-import", body)
	request.Header.Set("content-type", writer.FormDataContentType())
	if err := server.importClipboard(response, request, "sourcebook"); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusCreated {
		t.Fatalf("expected created response, got %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Results []clipboardImportResult `json:"results"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 1 || result.Results[0].Status != "imported" {
		t.Fatalf("unexpected browser import result: %#v", result.Results)
	}
}

func TestClipboardFileTypeMatchesImportedModality(t *testing.T) {
	for _, test := range []struct {
		name     string
		modality string
	}{
		{name: "reference.png", modality: "image"},
		{name: "voice.m4a", modality: "audio"},
		{name: "demo.mov", modality: "video"},
		{name: "brief.unknown-extension", modality: "file"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, modality := clipboardFileType(test.name)
			if modality != test.modality {
				t.Fatalf("clipboardFileType(%q) modality = %q, want %q", test.name, modality, test.modality)
			}
		})
	}
}

func TestClipboardSnapshotEntriesKeepFoldersSeparateFromFiles(t *testing.T) {
	root := t.TempDir()
	filePath := filepath.Join(root, "brief.pdf")
	if err := os.WriteFile(filePath, []byte("brief"), 0o600); err != nil {
		t.Fatal(err)
	}
	folderPath := filepath.Join(root, "reference-folder")
	if err := os.Mkdir(folderPath, 0o700); err != nil {
		t.Fatal(err)
	}

	snapshot, files := clipboardSnapshotEntries([]string{filePath, folderPath})
	if len(snapshot) != 1 || snapshot[0].path != filePath {
		t.Fatalf("snapshot = %#v, want only the regular file", snapshot)
	}
	if len(files) != 2 || files[0]["unsupportedReason"] != nil || files[1]["unsupportedReason"] != "folder" {
		t.Fatalf("clipboard display entries = %#v, want a file and a marked folder", files)
	}
}

func TestClipboardImportContinuesAfterAnUnreadableNativeItem(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	root := t.TempDir()
	filePath := filepath.Join(root, "valid.txt")
	if err := os.WriteFile(filePath, []byte("valid"), 0o600); err != nil {
		t.Fatal(err)
	}
	folderPath := filepath.Join(root, "not-a-file")
	if err := os.Mkdir(folderPath, 0o700); err != nil {
		t.Fatal(err)
	}
	server.clipboardSnapshots["mixed-token"] = clipboardSnapshot{files: []clipboardSnapshotFile{{id: "valid", path: filePath}, {id: "folder", path: folderPath}}, createdAt: time.Now()}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	payload, err := json.Marshal(clipboardImportRequest{Token: "mixed-token", Items: []clipboardImportItem{{ID: "valid", Kind: "native-file", NativeFileID: "valid"}, {ID: "folder", Kind: "native-file", NativeFileID: "folder"}}})
	if err != nil {
		t.Fatal(err)
	}
	meta, err := writer.CreateFormField("payload")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := meta.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/books/sourcebook/clipboard-import", body)
	request.Header.Set("content-type", writer.FormDataContentType())
	if err := server.importClipboard(response, request, "sourcebook"); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusCreated {
		t.Fatalf("expected created response, got %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Results []clipboardImportResult `json:"results"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 2 || result.Results[0].Status != "imported" || result.Results[1].Status != "failed" {
		t.Fatalf("unexpected mixed results: %#v", result.Results)
	}
}

func TestClipboardImportContinuesAfterAnInvalidLink(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	server := NewServer(library, "").(*Server)
	filePath := filepath.Join(t.TempDir(), "valid.txt")
	if err := os.WriteFile(filePath, []byte("valid"), 0o600); err != nil {
		t.Fatal(err)
	}
	server.clipboardSnapshots["mixed-token"] = clipboardSnapshot{files: []clipboardSnapshotFile{{id: "valid", path: filePath}}, createdAt: time.Now()}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	payload, err := json.Marshal(clipboardImportRequest{Token: "mixed-token", Items: []clipboardImportItem{
		{ID: "valid", Kind: "native-file", NativeFileID: "valid"},
		{ID: "bad-link", Kind: "link", Value: "mailto:not-a-web-link"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	meta, err := writer.CreateFormField("payload")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := meta.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/books/sourcebook/clipboard-import", body)
	request.Header.Set("content-type", writer.FormDataContentType())
	if err := server.importClipboard(response, request, "sourcebook"); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusCreated {
		t.Fatalf("expected created response, got %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Results []clipboardImportResult `json:"results"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 2 || result.Results[0].Status != "imported" || result.Results[1].Status != "failed" {
		t.Fatalf("unexpected mixed results: %#v", result.Results)
	}
}
