package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestPickerPageSnapshotPersistsAsLinkPreview(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	imageData := image.NewRGBA(image.Rect(0, 0, 2, 2))
	imageData.Set(0, 0, color.RGBA{R: 200, G: 80, B: 30, A: 255})
	var preview bytes.Buffer
	if err := png.Encode(&preview, imageData); err != nil {
		t.Fatal(err)
	}
	result, err := savePick(ctx, map[string]any{
		"modality": "link", "pickType": "page", "sourceUrl": "https://example.com/project",
		"contentUrl": "https://example.com/project", "itemTitle": "Project page",
		"thumbnailBase64": base64.StdEncoding.EncodeToString(preview.Bytes()),
		"thumbnailMimeType": "image/png",
	})
	if err != nil {
		t.Fatal(err)
	}
	items, err := sourceItems(ctx, "20", "")
	if err != nil {
		t.Fatal(err)
	}
	rows := items["items"].([]map[string]any)
	if len(rows) != 1 {
		t.Fatalf("saved items = %d, want 1", len(rows))
	}
	wantPreview := bookPreviewPath("sourcebook", result["sourceItemId"].(string))
	if rows[0]["thumbnailUrl"] != wantPreview || rows[0]["contentUrl"] != "https://example.com/project" {
		t.Fatalf("link lost its preview or original URL: %#v", rows[0])
	}
	response := httptest.NewRecorder()
	server := NewServer(library, "").(*Server)
	if err := server.previewSource(response, "sourcebook", result["sourceItemId"].(string)); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/png" || !bytes.Equal(response.Body.Bytes(), preview.Bytes()) {
		t.Fatalf("preview response = %d %q, bytes %d", response.Code, response.Header().Get("Content-Type"), response.Body.Len())
	}
}
