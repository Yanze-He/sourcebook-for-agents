package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestConcurrentPickSavesAreQueuedPerBook(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()

	server := NewServer(library, "").(*Server)
	const pickCount = 12
	start := make(chan struct{})
	failures := make(chan error, pickCount)
	var group sync.WaitGroup
	for index := 0; index < pickCount; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			<-start
			payload, err := json.Marshal(map[string]any{
				"bookId":    "sourcebook",
				"modality":  "link",
				"pickType":  "media",
				"sourceUrl": "https://example.com/reference/" + string(rune('a'+index)),
			})
			if err != nil {
				failures <- err
				return
			}
			request := httptest.NewRequest(http.MethodPost, "/api/picks", bytes.NewReader(payload))
			response := httptest.NewRecorder()
			if err := server.savePick(response, request, true); err != nil {
				failures <- err
				return
			}
			if response.Code != http.StatusCreated {
				failures <- errors.New("concurrent pick was not created")
			}
		}(index)
	}
	close(start)
	group.Wait()
	close(failures)
	for err := range failures {
		t.Error(err)
	}

	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != pickCount {
		t.Fatalf("expected %d saved picks, got %d", pickCount, count)
	}
}

func TestLibraryResetRemovesBooksAndStoredFiles(t *testing.T) {
	root := filepath.Join(t.TempDir(), "library")
	library, err := OpenLibrary(root, "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()

	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	storedFile := filepath.Join(ctx.MediaRoot, "sample.txt")
	if err := os.WriteFile(storedFile, []byte("saved source"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := library.CreateBook("Archive"); err != nil {
		t.Fatal(err)
	}

	manifest, err := library.Reset()
	if err != nil {
		t.Fatal(err)
	}
	if manifest.ActiveBookID != "sourcebook" || len(manifest.Books) != 1 || manifest.Books[0].Name != "Default Book" {
		t.Fatalf("unexpected reset manifest: %+v", manifest)
	}
	if _, err := os.Stat(storedFile); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stored file remains after reset: %v", err)
	}
	restoreHistory := filepath.Join(filepath.Dir(root), "Restore History", "library.previous-test")
	if err := os.MkdirAll(restoreHistory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(restoreHistory, "old-source.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := library.Reset(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(root), "Restore History")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("restore history remains after clearing local data: %v", err)
	}
	if _, err := library.Context("sourcebook"); err != nil {
		t.Fatalf("default Book was not re-created: %v", err)
	}
}

func TestStreamingBackupRestoresWithoutBase64Payload(t *testing.T) {
	source, err := OpenLibrary(filepath.Join(t.TempDir(), "source"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	ctx, err := source.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ctx.MediaRoot, "large-library-test.txt"), []byte("stored media"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := source.CreateBook("Archive"); err != nil {
		t.Fatal(err)
	}

	var archive bytes.Buffer
	if err := source.WriteBackup(&archive); err != nil {
		t.Fatal(err)
	}

	destinationRoot := filepath.Join(t.TempDir(), "destination")
	destination, err := OpenLibrary(destinationRoot, "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	manifest, imported, err := destination.RestoreArchive(bytes.NewReader(archive.Bytes()), "replace")
	if err != nil {
		t.Fatal(err)
	}
	if len(imported) != 2 || len(manifest.Books) != 2 {
		t.Fatalf("unexpected restore result: %+v, imported=%+v", manifest, imported)
	}
	if !containsString(manifest.UnreadBookIDs, "sourcebook") || !containsString(manifest.UnreadBookIDs, "archive") {
		t.Fatalf("restored Books should be unread: %+v", manifest.UnreadBookIDs)
	}
	if _, err := os.Stat(filepath.Join(destinationRoot, "books", "sourcebook", "assets", "large-library-test.txt")); err != nil {
		t.Fatalf("streamed backup did not restore local media: %v", err)
	}
	history, err := os.ReadDir(filepath.Join(filepath.Dir(destinationRoot), "Restore History"))
	if err != nil || len(history) != 1 {
		t.Fatalf("replaced library was not kept for recovery: entries=%v err=%v", history, err)
	}
}

func TestStreamingBackupCanBeLimitedToSelectedBooks(t *testing.T) {
	source, err := OpenLibrary(filepath.Join(t.TempDir(), "source"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	archiveBook, err := source.CreateBook("Archive")
	if err != nil {
		t.Fatal(err)
	}
	archiveContext, err := source.Context(archiveBook.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(archiveContext.MediaRoot, "selected.txt"), []byte("included"), 0o644); err != nil {
		t.Fatal(err)
	}

	var archive bytes.Buffer
	if err := source.WriteBackup(&archive, archiveBook.ID); err != nil {
		t.Fatal(err)
	}

	destination, err := OpenLibrary(filepath.Join(t.TempDir(), "destination"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	manifest, imported, err := destination.RestoreArchive(bytes.NewReader(archive.Bytes()), "replace")
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Books) != 1 || len(imported) != 1 || manifest.Books[0].ID != archiveBook.ID || manifest.ActiveBookID != archiveBook.ID {
		t.Fatalf("backup did not retain only the selected Book: manifest=%+v imported=%+v", manifest, imported)
	}
	if _, err := os.Stat(filepath.Join(destination.root, "books", archiveBook.ID, "assets", "selected.txt")); err != nil {
		t.Fatalf("selected Book media was not restored: %v", err)
	}
}

func TestSourceItemsExposeCachedFileName(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()

	ctx, err := library.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}

	const sourceID = "source-image"
	const resourceID = "resource-image"
	const sourceItemID = "source-item-image"
	const fileName = "reference-image.png"
	const pickedAt = "2026-10-12T08:00:00Z"
	if err := os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), []byte("image bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", sourceID, "Example", "https://example.com/image.png", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)", resourceID, "image", sourceID, "Reference image", "", "image-hash", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)", "asset-image", resourceID, "image/png", "https://example.com/image.png", "/media/asset-image", "cached", fileName, "linked"); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", sourceItemID, resourceID, sourceID, "Reference image", "", "available", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", "pick-image", resourceID, sourceID, sourceItemID, "image", "media", "{}", pickedAt); err != nil {
		t.Fatal(err)
	}

	result, err := sourceItems(ctx, "20", "")
	if err != nil {
		t.Fatal(err)
	}
	items := result["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("expected one source item, got %d", len(items))
	}
	if got := items[0]["fileName"]; got != fileName {
		t.Fatalf("expected fileName %q, got %#v", fileName, got)
	}
	if got := items[0]["assetCacheState"]; got != "cached" {
		t.Fatalf("expected cached asset state, got %#v", got)
	}
	if got := items[0]["thumbnailUrl"]; got != "/api/books/sourcebook/media/asset-image" {
		t.Fatalf("expected local media URL, got %#v", got)
	}
}

func TestAppendBackupKeepsDuplicateBookNameAndRebindsCachedMedia(t *testing.T) {
	source, err := OpenLibrary(filepath.Join(t.TempDir(), "source"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()

	ctx, err := source.Context("sourcebook")
	if err != nil {
		t.Fatal(err)
	}
	const fileName = "reference-image.png"
	const pickedAt = "2026-10-12T08:00:00Z"
	if err := os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), []byte("image bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", "source-image", "Example", "https://example.com/image.png", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)", "resource-image", "image", "source-image", "Reference image", "", "image-hash", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)", "asset-image", "resource-image", "image/png", "https://example.com/image.png", "/api/books/sourcebook/media/asset-image", "cached", fileName, "linked"); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", "source-item-image", "resource-image", "source-image", "Reference image", "", "available", pickedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.DB.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", "pick-image", "resource-image", "source-image", "source-item-image", "image", "media", "{}", pickedAt); err != nil {
		t.Fatal(err)
	}

	var archive bytes.Buffer
	if err := source.WriteBackup(&archive); err != nil {
		t.Fatal(err)
	}

	destination, err := OpenLibrary(filepath.Join(t.TempDir(), "destination"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	manifest, imported, err := destination.RestoreArchive(bytes.NewReader(archive.Bytes()), "append")
	if err != nil {
		t.Fatal(err)
	}
	if len(imported) != 1 || imported[0].ID != "sourcebook-2" || imported[0].Name != "Default Book" {
		t.Fatalf("unexpected imported Book: %+v", imported)
	}
	if !containsString(manifest.UnreadBookIDs, "sourcebook-2") {
		t.Fatalf("imported Book should be unread: %+v", manifest.UnreadBookIDs)
	}
	importedContext, err := destination.Context(imported[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(importedContext.MediaRoot, fileName)); err != nil {
		t.Fatalf("imported cached file is missing: %v", err)
	}
	items, err := sourceItems(importedContext, "20", "")
	if err != nil {
		t.Fatal(err)
	}
	result := items["items"].([]map[string]any)
	if len(result) != 1 || result[0]["thumbnailUrl"] != "/api/books/sourcebook-2/media/asset-image" {
		t.Fatalf("cached media did not bind to imported Book: %#v", result)
	}
}

func TestOpeningUnreadBookClearsItsNotification(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()
	book, err := library.CreateBook("Archive")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := library.MarkUnread(book.ID); err != nil {
		t.Fatal(err)
	}
	manifest, err := library.SetActive(book.ID)
	if err != nil {
		t.Fatal(err)
	}
	if containsString(manifest.UnreadBookIDs, book.ID) {
		t.Fatalf("opened Book remains unread: %+v", manifest.UnreadBookIDs)
	}
}

func TestSourceChangeNotificationsStayWithinTheirBook(t *testing.T) {
	library, err := OpenLibrary(filepath.Join(t.TempDir(), "library"), "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer library.Close()

	server := NewServer(library, "").(*Server)
	defaultChanges, stopDefault := server.subscribeSourceChanges("sourcebook")
	defer stopDefault()
	archiveChanges, stopArchive := server.subscribeSourceChanges("archive")
	defer stopArchive()

	server.publishSourceChange("sourcebook")
	select {
	case <-defaultChanges:
	default:
		t.Fatal("expected the current Book subscriber to receive a change")
	}
	select {
	case <-archiveChanges:
		t.Fatal("a different Book subscriber received a change")
	default:
	}
}
