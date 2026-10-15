package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const libraryVersion = 1

type Book struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Directory is the Book's local folder name. It is intentionally separate
	// from ID: extensions and API URLs keep using the stable ID when a user
	// renames a Book, while the folder remains understandable in Finder/Explorer.
	Directory string `json:"directory,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type Manifest struct {
	Version       int      `json:"version"`
	ActiveBookID  string   `json:"activeBookId"`
	Books         []Book   `json:"books"`
	UnreadBookIDs []string `json:"unreadBookIds,omitempty"`
}

type Library struct {
	root               string
	legacyDBPath       string
	locationConfigPath string
	mu                 sync.Mutex
	dbs                map[string]*sql.DB
}

type libraryLocationConfig struct {
	LibraryRoot string `json:"libraryRoot"`
	Confirmed   bool   `json:"confirmed"`
	CleanupRoot string `json:"cleanupRoot,omitempty"`
	MigratedAt  string `json:"migratedAt,omitempty"`
}

type BookContext struct {
	Book      Book
	DB        *sql.DB
	Root      string
	MediaRoot string
}

type BackupFile struct {
	Path   string `json:"path"`
	Bytes  string `json:"bytes"`
	Size   int    `json:"size"`
	SHA256 string `json:"sha256"`
}

type BackupBook struct {
	Book
	Files []BackupFile `json:"files"`
}

type BackupPayload struct {
	Format    string `json:"format"`
	Version   int    `json:"version"`
	CreatedAt string `json:"createdAt"`
	Library   struct {
		ActiveBookID string `json:"activeBookId"`
	} `json:"library"`
	Books []BackupBook `json:"books"`
}

type BackupArchiveManifest struct {
	Format    string `json:"format"`
	Version   int    `json:"version"`
	CreatedAt string `json:"createdAt"`
	Library   struct {
		ActiveBookID string `json:"activeBookId"`
	} `json:"library"`
	Books []Book `json:"books"`
}

func OpenLibrary(root, legacyDBPath, locationConfigPath string) (*Library, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	library := &Library{root: root, legacyDBPath: legacyDBPath, locationConfigPath: locationConfigPath, dbs: map[string]*sql.DB{}}
	if err := os.MkdirAll(filepath.Join(root, "books"), 0o755); err != nil {
		return nil, err
	}
	if _, err := library.readManifest(); err != nil {
		return nil, err
	}
	if err := library.finishPendingCleanup(); err != nil {
		// A failed cleanup must never make an otherwise healthy library unavailable.
		// It remains recorded and is retried on the next launch.
		_ = err
	}
	return library, nil
}

func (library *Library) Close() {
	library.mu.Lock()
	defer library.mu.Unlock()
	for _, db := range library.dbs {
		_ = db.Close()
	}
	library.dbs = map[string]*sql.DB{}
}

func (library *Library) manifestPath() string { return filepath.Join(library.root, "library.json") }
func (library *Library) bookRoot(book Book) string {
	return filepath.Join(library.root, "books", bookDirectory(book))
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func (library *Library) readManifest() (Manifest, error) {
	path := library.manifestPath()
	bytes, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		manifest := Manifest{Version: libraryVersion, ActiveBookID: "sourcebook", Books: []Book{{ID: "sourcebook", Name: "Default Book", Directory: "sourcebook", CreatedAt: now()}}}
		if err := library.writeManifest(manifest); err != nil {
			return Manifest{}, err
		}
		if err := library.migrateLegacy(manifest.Books[0]); err != nil {
			return Manifest{}, err
		}
		return manifest, nil
	}
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(bytes, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("read Sourcebook library manifest: %w", err)
	}
	if len(manifest.Books) == 0 {
		manifest.Books = []Book{{ID: "sourcebook", Name: "Default Book", Directory: "sourcebook", CreatedAt: now()}}
		manifest.ActiveBookID = "sourcebook"
	}
	if manifest.ActiveBookID == "" {
		manifest.ActiveBookID = manifest.Books[0].ID
	}
	manifest.Version = libraryVersion
	normalizeBookDirectories(&manifest)
	normalizeUnreadBookIDs(&manifest)
	return manifest, library.writeManifest(manifest)
}

func (library *Library) writeManifest(manifest Manifest) error {
	manifest.Version = libraryVersion
	normalizeBookDirectories(&manifest)
	normalizeUnreadBookIDs(&manifest)
	if err := os.MkdirAll(library.root, 0o755); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(library.manifestPath(), bytes, 0o644)
}

func (library *Library) migrateLegacy(book Book) error {
	if library.legacyDBPath == "" {
		return nil
	}
	if _, err := os.Stat(library.legacyDBPath); err != nil {
		return nil
	}
	targetRoot := library.bookRoot(book)
	targetDB := filepath.Join(targetRoot, "book.sqlite")
	if _, err := os.Stat(targetDB); err == nil {
		return nil
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		return err
	}
	if err := copyFile(library.legacyDBPath, targetDB); err != nil {
		return err
	}
	legacyAssets := filepath.Join(filepath.Dir(library.legacyDBPath), "assets")
	if _, err := os.Stat(legacyAssets); err == nil {
		return copyDirectory(legacyAssets, filepath.Join(targetRoot, "assets"))
	}
	return nil
}

func (library *Library) List() (Manifest, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	return library.readManifest()
}

// IsEmpty reports whether the library contains only the untouched Default Book.
// The Default Book and its SQLite file are created by Sourcebook itself, so they
// do not count as user data for first-run onboarding.
func (library *Library) IsEmpty() (bool, error) {
	library.mu.Lock()
	defer library.mu.Unlock()

	manifest, err := library.readManifest()
	if err != nil {
		return false, err
	}
	if len(manifest.Books) != 1 || manifest.Books[0].ID != "sourcebook" || manifest.Books[0].Name != "Default Book" {
		return false, nil
	}

	databasePath := filepath.Join(library.bookRoot(manifest.Books[0]), "book.sqlite")
	if _, err := os.Stat(databasePath); errors.Is(err, os.ErrNotExist) {
		return true, nil
	} else if err != nil {
		return false, err
	}
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return false, err
	}
	defer database.Close()
	if err := schema(database); err != nil {
		return false, err
	}
	var records int
	err = database.QueryRow(`SELECT
		(SELECT COUNT(*) FROM sources) +
		(SELECT COUNT(*) FROM resources) +
		(SELECT COUNT(*) FROM text_contents) +
		(SELECT COUNT(*) FROM assets) +
		(SELECT COUNT(*) FROM source_items) +
		(SELECT COUNT(*) FROM picks) +
		(SELECT COUNT(*) FROM source_packs)`).Scan(&records)
	if err != nil {
		return false, err
	}
	return records == 0, nil
}

func (library *Library) Context(bookID string) (*BookContext, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return nil, err
	}
	var book *Book
	for index := range manifest.Books {
		if manifest.Books[index].ID == bookID {
			book = &manifest.Books[index]
			break
		}
	}
	if book == nil {
		return nil, errors.New("Book 不存在或已被删除，请重新选择。")
	}
	root := library.bookRoot(*book)
	mediaRoot := filepath.Join(root, "assets")
	if err := os.MkdirAll(mediaRoot, 0o755); err != nil {
		return nil, err
	}
	db := library.dbs[book.ID]
	if db == nil {
		db, err = sql.Open("sqlite", filepath.Join(root, "book.sqlite"))
		if err != nil {
			return nil, err
		}
		// A Book is a local SQLite database. Keeping one connection per Book makes
		// overlapping picker saves wait their turn instead of competing for a write lock.
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(1)
		if err := schema(db); err != nil {
			_ = db.Close()
			return nil, err
		}
		library.dbs[book.ID] = db
	}
	return &BookContext{Book: *book, DB: db, Root: root, MediaRoot: mediaRoot}, nil
}

func (library *Library) CreateBook(name string) (Book, error) {
	clean := cleanBookName(name)
	if clean == "" {
		return Book{}, errors.New("Book 名称不能为空")
	}
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return Book{}, err
	}
	base := slug(clean)
	if base == "" {
		base = "book"
	}
	id := base
	for suffix := 2; containsBook(manifest.Books, id); suffix++ {
		id = fmt.Sprintf("%s-%d", base, suffix)
	}
	book := Book{ID: id, Name: clean, Directory: nextBookDirectory(clean, manifest.Books, ""), CreatedAt: now()}
	manifest.Books = append(manifest.Books, book)
	if err := library.writeManifest(manifest); err != nil {
		return Book{}, err
	}
	return book, nil
}

func (library *Library) RenameBook(bookID, name string) (Book, error) {
	clean := cleanBookName(name)
	if clean == "" {
		return Book{}, errors.New("Book 名称不能为空")
	}
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return Book{}, err
	}
	for index := range manifest.Books {
		if manifest.Books[index].ID != bookID {
			continue
		}

		book := &manifest.Books[index]
		previousDirectory := bookDirectory(*book)
		nextDirectory := nextBookDirectory(clean, manifest.Books, book.ID)
		previousRoot := library.bookRoot(*book)
		nextRoot := filepath.Join(library.root, "books", nextDirectory)

		if previousDirectory != nextDirectory {
			if _, err := os.Stat(nextRoot); err == nil {
				return Book{}, errors.New("已有同名 Book 文件夹，请使用其他名称")
			} else if !errors.Is(err, os.ErrNotExist) {
				return Book{}, err
			}
			if db := library.dbs[bookID]; db != nil {
				_, _ = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
				_ = db.Close()
				delete(library.dbs, bookID)
			}
			if _, err := os.Stat(previousRoot); err == nil {
				if err := os.Rename(previousRoot, nextRoot); err != nil {
					return Book{}, err
				}
			} else if !errors.Is(err, os.ErrNotExist) {
				return Book{}, err
			}
		}

		book.Name = clean
		book.Directory = nextDirectory
		if err := library.writeManifest(manifest); err != nil {
			if previousDirectory != nextDirectory {
				_ = os.Rename(nextRoot, previousRoot)
			}
			return Book{}, err
		}
		return *book, nil
	}
	return Book{}, errors.New("Book 不存在或已被删除，请重新选择。")
}

func (library *Library) SetActive(bookID string) (Manifest, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return Manifest{}, err
	}
	if !containsBook(manifest.Books, bookID) {
		return Manifest{}, errors.New("Book 不存在或已被删除，请重新选择。")
	}
	manifest.ActiveBookID = bookID
	manifest.UnreadBookIDs = withoutBookID(manifest.UnreadBookIDs, bookID)
	return manifest, library.writeManifest(manifest)
}

func (library *Library) MarkUnread(bookIDs ...string) (Manifest, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return Manifest{}, err
	}
	known := map[string]bool{}
	for _, book := range manifest.Books {
		known[book.ID] = true
	}
	for _, bookID := range bookIDs {
		if known[bookID] && !containsString(manifest.UnreadBookIDs, bookID) {
			manifest.UnreadBookIDs = append(manifest.UnreadBookIDs, bookID)
		}
	}
	return manifest, library.writeManifest(manifest)
}

func (library *Library) DeleteBook(bookID string) (Manifest, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	manifest, err := library.readManifest()
	if err != nil {
		return Manifest{}, err
	}
	if len(manifest.Books) <= 1 {
		return Manifest{}, errors.New("至少需要保留一个 Book。")
	}
	index := -1
	for i, book := range manifest.Books {
		if book.ID == bookID {
			index = i
			break
		}
	}
	if index == -1 {
		return Manifest{}, errors.New("Book 不存在或已被删除，请重新选择。")
	}
	if db := library.dbs[bookID]; db != nil {
		_, _ = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
		_ = db.Close()
		delete(library.dbs, bookID)
	}
	trash := filepath.Join(library.root, ".trash")
	if err := os.MkdirAll(trash, 0o755); err != nil {
		return Manifest{}, err
	}
	if err := os.Rename(library.bookRoot(manifest.Books[index]), filepath.Join(trash, fmt.Sprintf("%d-%s", time.Now().UnixMilli(), bookID))); err != nil {
		return Manifest{}, err
	}
	manifest.Books = append(manifest.Books[:index], manifest.Books[index+1:]...)
	manifest.UnreadBookIDs = withoutBookID(manifest.UnreadBookIDs, bookID)
	if manifest.ActiveBookID == bookID {
		manifest.ActiveBookID = manifest.Books[0].ID
	}
	return manifest, library.writeManifest(manifest)
}

func (library *Library) Reset() (Manifest, error) {
	library.mu.Lock()
	defer library.mu.Unlock()

	for _, db := range library.dbs {
		_ = db.Close()
	}
	library.dbs = map[string]*sql.DB{}

	manifest := Manifest{
		Version:      libraryVersion,
		ActiveBookID: "sourcebook",
		Books:        []Book{{ID: "sourcebook", Name: "Default Book", Directory: "sourcebook", CreatedAt: now()}},
	}
	staging := fmt.Sprintf("%s.reset-%d", library.root, time.Now().UnixMilli())
	if err := os.MkdirAll(filepath.Join(staging, "books"), 0o755); err != nil {
		return Manifest{}, err
	}
	defer os.RemoveAll(staging)
	bytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return Manifest{}, err
	}
	if err := os.WriteFile(filepath.Join(staging, "library.json"), bytes, 0o644); err != nil {
		return Manifest{}, err
	}

	previous := fmt.Sprintf("%s.previous-%d", library.root, time.Now().UnixMilli())
	if err := os.Rename(library.root, previous); err != nil {
		return Manifest{}, err
	}
	if err := os.Rename(staging, library.root); err != nil {
		_ = os.Rename(previous, library.root)
		return Manifest{}, err
	}
	if err := os.RemoveAll(previous); err != nil {
		return Manifest{}, err
	}
	if err := os.RemoveAll(filepath.Join(filepath.Dir(library.root), "Restore History")); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func (library *Library) Backup() ([]byte, error) {
	manifest, err := library.List()
	if err != nil {
		return nil, err
	}
	payload := BackupPayload{Format: "sourcebook-backup", Version: 1, CreatedAt: now()}
	payload.Library.ActiveBookID = manifest.ActiveBookID
	for _, book := range manifest.Books {
		ctx, err := library.Context(book.ID)
		if err != nil {
			return nil, err
		}
		if _, err := ctx.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
			return nil, err
		}
		files, err := backupFiles(ctx.Root)
		if err != nil {
			return nil, err
		}
		payload.Books = append(payload.Books, BackupBook{Book: book, Files: files})
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var output strings.Builder
	zipper := gzip.NewWriter(&output)
	if _, err := zipper.Write(data); err != nil {
		return nil, err
	}
	if err := zipper.Close(); err != nil {
		return nil, err
	}
	return []byte(output.String()), nil
}

// WriteBackup writes version 2 backups as a tar.gz stream. Files stay binary inside
// the archive so large libraries do not need a base64 or memory-sized intermediary.
// Passing Book IDs limits the archive to those Books; an empty list exports all Books.
func (library *Library) WriteBackup(destination io.Writer, bookIDs ...string) error {
	manifest, err := library.List()
	if err != nil {
		return err
	}
	books, err := selectBackupBooks(manifest, bookIDs)
	if err != nil {
		return err
	}
	archive := BackupArchiveManifest{Format: "sourcebook-backup", Version: 2, CreatedAt: now(), Books: books}
	archive.Library.ActiveBookID = manifest.ActiveBookID
	if !containsBook(books, archive.Library.ActiveBookID) {
		archive.Library.ActiveBookID = books[0].ID
	}

	gzipWriter := gzip.NewWriter(destination)
	tarWriter := tar.NewWriter(gzipWriter)
	manifestBytes, err := json.Marshal(archive)
	if err != nil {
		return err
	}
	if err := tarWriter.WriteHeader(&tar.Header{Name: "manifest.json", Mode: 0o644, Size: int64(len(manifestBytes))}); err != nil {
		return err
	}
	if _, err := tarWriter.Write(manifestBytes); err != nil {
		return err
	}

	for _, book := range books {
		ctx, err := library.Context(book.ID)
		if err != nil {
			return err
		}
		if _, err := ctx.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
			return err
		}
		if err := filepath.WalkDir(ctx.Root, func(filePath string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil || entry.IsDir() || strings.HasSuffix(filePath, "-wal") || strings.HasSuffix(filePath, "-shm") {
				return walkErr
			}
			relative, err := filepath.Rel(ctx.Root, filePath)
			if err != nil {
				return err
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			header, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			header.Name = path.Join("books", book.ID, filepath.ToSlash(relative))
			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}
			input, err := os.Open(filePath)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(tarWriter, input)
			closeErr := input.Close()
			if copyErr != nil {
				return copyErr
			}
			return closeErr
		}); err != nil {
			return err
		}
	}
	if err := tarWriter.Close(); err != nil {
		return err
	}
	return gzipWriter.Close()
}

func selectBackupBooks(manifest Manifest, requestedIDs []string) ([]Book, error) {
	if len(requestedIDs) == 0 {
		return manifest.Books, nil
	}
	requested := map[string]bool{}
	for _, bookID := range requestedIDs {
		if bookID == "" || requested[bookID] {
			continue
		}
		requested[bookID] = true
	}
	selected := make([]Book, 0, len(requested))
	for _, book := range manifest.Books {
		if requested[book.ID] {
			selected = append(selected, book)
			delete(requested, book.ID)
		}
	}
	if len(selected) == 0 || len(requested) > 0 {
		return nil, errors.New("请选择至少一个有效的 Book")
	}
	return selected, nil
}

func (library *Library) Restore(data []byte, mode string) (Manifest, []Book, error) {
	zipper, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
	}
	defer zipper.Close()
	return library.restoreLegacy(zipper, mode)
}

func (library *Library) RestoreArchive(input io.Reader, mode string) (Manifest, []Book, error) {
	zipper, err := gzip.NewReader(input)
	if err != nil {
		return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
	}
	defer zipper.Close()
	content := bufio.NewReader(zipper)
	first, err := content.Peek(1)
	if err != nil {
		return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
	}
	if first[0] == '{' {
		return library.restoreLegacy(content, mode)
	}
	return library.restoreArchiveTar(content, mode)
}

func (library *Library) restoreLegacy(input io.Reader, mode string) (Manifest, []Book, error) {
	var payload BackupPayload
	if err := json.NewDecoder(input).Decode(&payload); err != nil || payload.Format != "sourcebook-backup" || len(payload.Books) == 0 {
		return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
	}
	for _, book := range payload.Books {
		for _, file := range book.Files {
			bytes, err := base64.StdEncoding.DecodeString(file.Bytes)
			if err != nil || len(bytes) != file.Size || digest(bytes) != file.SHA256 {
				return Manifest{}, nil, fmt.Errorf("备份校验失败：%s", file.Path)
			}
		}
	}

	return library.restoreLegacyPayload(payload, mode)
}

func (library *Library) restoreLegacyPayload(payload BackupPayload, mode string) (Manifest, []Book, error) {
	library.Close()
	if mode == "replace" {
		staging := fmt.Sprintf("%s.restore-%d", library.root, time.Now().UnixMilli())
		if err := writeBackupLibrary(staging, payload); err != nil {
			return Manifest{}, nil, err
		}
		old := fmt.Sprintf("%s.previous-%d", library.root, time.Now().UnixMilli())
		if err := os.Rename(library.root, old); err != nil {
			return Manifest{}, nil, err
		}
		if err := os.Rename(staging, library.root); err != nil {
			_ = os.Rename(old, library.root)
			return Manifest{}, nil, err
		}
		library.preserveReplacedLibrary(old)
		manifest, err := library.List()
		if err != nil {
			return Manifest{}, nil, err
		}
		markBooksUnread(&manifest, manifest.Books)
		if err := library.writeManifest(manifest); err != nil {
			return Manifest{}, nil, err
		}
		return manifest, manifest.Books, nil
	}

	manifest, err := library.List()
	if err != nil {
		return Manifest{}, nil, err
	}
	imported := []Book{}
	for _, backup := range payload.Books {
		book := backup.Book
		originalID := book.ID
		for suffix := 2; containsBook(manifest.Books, book.ID); suffix++ {
			book.ID = fmt.Sprintf("%s-%d", originalID, suffix)
		}
		book.Directory = nextBookDirectory(book.Name, manifest.Books, "")
		book.CreatedAt = now()
		if err := writeBackupBook(library.root, book, backup.Files); err != nil {
			return Manifest{}, nil, err
		}
		if err := rewriteCachedAssetURIs(library.bookRoot(book), book.ID); err != nil {
			return Manifest{}, nil, err
		}
		manifest.Books = append(manifest.Books, book)
		imported = append(imported, book)
	}
	markBooksUnread(&manifest, imported)
	if err := library.writeManifest(manifest); err != nil {
		return Manifest{}, nil, err
	}
	return manifest, imported, nil
}

func (library *Library) restoreArchiveTar(input io.Reader, mode string) (Manifest, []Book, error) {
	staging := fmt.Sprintf("%s.import-%d", library.root, time.Now().UnixMilli())
	if err := os.MkdirAll(filepath.Join(staging, "books"), 0o755); err != nil {
		return Manifest{}, nil, err
	}
	defer os.RemoveAll(staging)

	archiveReader := tar.NewReader(input)
	var archive BackupArchiveManifest
	bookIDs := map[string]bool{}
	manifestRead := false
	for {
		header, err := archiveReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Manifest{}, nil, err
		}
		if header.Typeflag != tar.TypeReg {
			return Manifest{}, nil, errors.New("备份包含不支持的文件类型")
		}
		if header.Name == "manifest.json" {
			if manifestRead || header.Size > 1024*1024 {
				return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
			}
			if err := json.NewDecoder(io.LimitReader(archiveReader, header.Size)).Decode(&archive); err != nil {
				return Manifest{}, nil, errors.New("不是有效的 Sourcebook 备份文件")
			}
			if err := validateBackupArchive(archive); err != nil {
				return Manifest{}, nil, err
			}
			for _, book := range archive.Books {
				bookIDs[book.ID] = true
			}
			manifestRead = true
			continue
		}
		if !manifestRead {
			return Manifest{}, nil, errors.New("备份缺少清单文件")
		}
		target, err := archiveFileTarget(staging, header.Name, bookIDs)
		if err != nil {
			return Manifest{}, nil, err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return Manifest{}, nil, err
		}
		output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			return Manifest{}, nil, err
		}
		_, copyErr := io.Copy(output, archiveReader)
		closeErr := output.Close()
		if copyErr != nil {
			return Manifest{}, nil, copyErr
		}
		if closeErr != nil {
			return Manifest{}, nil, closeErr
		}
	}
	if !manifestRead {
		return Manifest{}, nil, errors.New("备份缺少清单文件")
	}
	return library.installBackupArchive(staging, archive, mode)
}

func validateBackupArchive(archive BackupArchiveManifest) error {
	if archive.Format != "sourcebook-backup" || archive.Version != 2 || len(archive.Books) == 0 {
		return errors.New("不是有效的 Sourcebook 备份文件")
	}
	ids := map[string]bool{}
	for _, book := range archive.Books {
		if book.ID == "" || book.Name == "" || ids[book.ID] {
			return errors.New("不是有效的 Sourcebook 备份文件")
		}
		ids[book.ID] = true
	}
	if !ids[archive.Library.ActiveBookID] {
		return errors.New("不是有效的 Sourcebook 备份文件")
	}
	return nil
}

func archiveFileTarget(root, name string, bookIDs map[string]bool) (string, error) {
	if name != path.Clean(name) || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
		return "", errors.New("备份包含非法路径")
	}
	parts := strings.Split(name, "/")
	if len(parts) < 3 || parts[0] != "books" || !bookIDs[parts[1]] {
		return "", errors.New("备份包含未知文件")
	}
	return filepath.Join(root, filepath.FromSlash(name)), nil
}

func (library *Library) installBackupArchive(staging string, archive BackupArchiveManifest, mode string) (Manifest, []Book, error) {
	library.Close()
	if mode == "replace" {
		manifest := Manifest{Version: libraryVersion, ActiveBookID: archive.Library.ActiveBookID, Books: archive.Books}
		normalizeBookDirectories(&manifest)
		if err := alignStagedBookDirectories(staging, manifest.Books); err != nil {
			return Manifest{}, nil, err
		}
		if err := writeManifestAt(staging, manifest); err != nil {
			return Manifest{}, nil, err
		}
		previous := fmt.Sprintf("%s.previous-%d", library.root, time.Now().UnixMilli())
		if err := os.Rename(library.root, previous); err != nil {
			return Manifest{}, nil, err
		}
		if err := os.Rename(staging, library.root); err != nil {
			_ = os.Rename(previous, library.root)
			return Manifest{}, nil, err
		}
		library.preserveReplacedLibrary(previous)
		manifest, err := library.List()
		if err != nil {
			return Manifest{}, nil, err
		}
		markBooksUnread(&manifest, manifest.Books)
		if err := library.writeManifest(manifest); err != nil {
			return Manifest{}, nil, err
		}
		return manifest, manifest.Books, nil
	}

	manifest, err := library.List()
	if err != nil {
		return Manifest{}, nil, err
	}
	imported := []Book{}
	for _, backup := range archive.Books {
		book := backup
		originalID := book.ID
		for suffix := 2; containsBook(manifest.Books, book.ID); suffix++ {
			book.ID = fmt.Sprintf("%s-%d", originalID, suffix)
		}
		book.Directory = nextBookDirectory(book.Name, manifest.Books, "")
		book.CreatedAt = now()
		if err := os.Rename(filepath.Join(staging, "books", backup.ID), library.bookRoot(book)); err != nil {
			return Manifest{}, nil, err
		}
		if err := rewriteCachedAssetURIs(library.bookRoot(book), book.ID); err != nil {
			return Manifest{}, nil, err
		}
		manifest.Books = append(manifest.Books, book)
		imported = append(imported, book)
	}
	markBooksUnread(&manifest, imported)
	if err := library.writeManifest(manifest); err != nil {
		return Manifest{}, nil, err
	}
	return manifest, imported, nil
}

// preserveReplacedLibrary keeps one recoverable copy outside the active library
// after an explicit backup replacement. If the move cannot complete, leaving the
// sibling directory in place is still safer than deleting the user's old data.
func (library *Library) preserveReplacedLibrary(previous string) {
	history := filepath.Join(filepath.Dir(library.root), "Restore History")
	if err := os.MkdirAll(history, 0o700); err != nil {
		return
	}
	_ = os.Rename(previous, filepath.Join(history, filepath.Base(previous)))
}

func rewriteCachedAssetURIs(bookRoot, bookID string) error {
	db, err := sql.Open("sqlite", filepath.Join(bookRoot, "book.sqlite"))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec("UPDATE assets SET file_uri='/api/books/' || ? || '/media/' || id WHERE cache_state='cached'", bookID)
	return err
}

func markBooksUnread(manifest *Manifest, books []Book) {
	for _, book := range books {
		if !containsString(manifest.UnreadBookIDs, book.ID) {
			manifest.UnreadBookIDs = append(manifest.UnreadBookIDs, book.ID)
		}
	}
	normalizeUnreadBookIDs(manifest)
}

func normalizeUnreadBookIDs(manifest *Manifest) {
	known := map[string]bool{}
	for _, book := range manifest.Books {
		known[book.ID] = true
	}
	unique := make([]string, 0, len(manifest.UnreadBookIDs))
	for _, bookID := range manifest.UnreadBookIDs {
		if known[bookID] && !containsString(unique, bookID) {
			unique = append(unique, bookID)
		}
	}
	manifest.UnreadBookIDs = unique
}

func withoutBookID(bookIDs []string, bookID string) []string {
	result := make([]string, 0, len(bookIDs))
	for _, current := range bookIDs {
		if current != bookID {
			result = append(result, current)
		}
	}
	return result
}

func containsString(values []string, value string) bool {
	for _, current := range values {
		if current == value {
			return true
		}
	}
	return false
}

func writeManifestAt(root string, manifest Manifest) error {
	manifest.Version = libraryVersion
	normalizeBookDirectories(&manifest)
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "library.json"), data, 0o644)
}

func (library *Library) Migrate(destination string) (string, error) {
	targetRoot, err := filepath.Abs(strings.TrimSpace(destination))
	if err != nil || targetRoot == "" || targetRoot == library.root {
		return "", errors.New("请选择不同的素材库位置")
	}
	if _, err := os.Stat(targetRoot); err == nil {
		return "", errors.New("目标位置已存在同名素材库")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	sourceRoot := library.root
	library.Close()
	if err := copyDirectory(sourceRoot, targetRoot); err != nil {
		return "", err
	}
	if err := verifyLibraryRoot(targetRoot); err != nil {
		_ = os.RemoveAll(targetRoot)
		return "", fmt.Errorf("素材库校验失败: %w", err)
	}
	// Switch only after the candidate can be opened. Existing requests are held by
	// the server's exclusive migration lock, so they cannot observe this boundary.
	library.root = targetRoot
	if _, err := library.readManifest(); err != nil {
		library.root = sourceRoot
		_, _ = library.readManifest()
		_ = os.RemoveAll(targetRoot)
		return "", err
	}
	if library.locationConfigPath != "" {
		if err := writeLibraryLocationConfig(library.locationConfigPath, libraryLocationConfig{LibraryRoot: targetRoot, Confirmed: true, CleanupRoot: sourceRoot, MigratedAt: now()}); err != nil {
			library.root = sourceRoot
			_, _ = library.readManifest()
			_ = os.RemoveAll(targetRoot)
			return "", err
		}
	}
	if err := os.RemoveAll(sourceRoot); err == nil && library.locationConfigPath != "" {
		_ = writeLibraryLocationConfig(library.locationConfigPath, libraryLocationConfig{LibraryRoot: targetRoot, Confirmed: true, MigratedAt: now()})
	}
	return targetRoot, nil
}

func (library *Library) ConfirmLocation() error {
	if library.locationConfigPath == "" {
		return nil
	}
	return writeLibraryLocationConfig(library.locationConfigPath, libraryLocationConfig{LibraryRoot: library.root, Confirmed: true})
}

func (library *Library) Location() (root string, defaultRoot string, configured bool) {
	root = library.root
	if library.locationConfigPath == "" {
		return root, root, true
	}
	defaultRoot = filepath.Join(filepath.Dir(library.locationConfigPath), "Sourcebook Library")
	config, err := readLibraryLocationConfig(library.locationConfigPath)
	return root, defaultRoot, err == nil && config.Confirmed
}

func (library *Library) finishPendingCleanup() error {
	if library.locationConfigPath == "" {
		return nil
	}
	config, err := readLibraryLocationConfig(library.locationConfigPath)
	if err != nil || config.CleanupRoot == "" || config.LibraryRoot != library.root || config.CleanupRoot == library.root {
		return err
	}
	if err := os.RemoveAll(config.CleanupRoot); err != nil {
		return err
	}
	config.CleanupRoot = ""
	return writeLibraryLocationConfig(library.locationConfigPath, config)
}

func verifyLibraryRoot(root string) error {
	candidate, err := OpenLibrary(root, "", "")
	if err != nil {
		return err
	}
	defer candidate.Close()
	manifest, err := candidate.List()
	if err != nil {
		return err
	}
	for _, book := range manifest.Books {
		if _, err := candidate.Context(book.ID); err != nil {
			return err
		}
	}
	return nil
}

func readLibraryLocationConfig(path string) (libraryLocationConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return libraryLocationConfig{}, err
	}
	config := libraryLocationConfig{}
	if err := json.Unmarshal(data, &config); err != nil {
		return libraryLocationConfig{}, err
	}
	return config, nil
}

func writeLibraryLocationConfig(path string, config libraryLocationConfig) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".library-location-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func schema(db *sql.DB) error {
	// Keep databases created by the early Node service readable without a separate migration tool.
	for _, migration := range []string{
		"ALTER TABLE inbox_items RENAME TO source_items",
		"ALTER TABLE sources RENAME COLUMN captured_at TO picked_at",
		"ALTER TABLE source_items RENAME COLUMN capture_state TO storage_state",
		"ALTER TABLE picks RENAME COLUMN inbox_item_id TO source_item_id",
		"ALTER TABLE picks RENAME COLUMN captured_at TO picked_at",
		"ALTER TABLE source_pack_items RENAME COLUMN inbox_item_id TO source_item_id",
	} {
		_, _ = db.Exec(migration)
	}
	statements := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
		"CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, label TEXT NOT NULL, url TEXT NOT NULL, picked_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL, summary TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0)",
		"CREATE TABLE IF NOT EXISTS text_contents (resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE, text TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE, mime_type TEXT NOT NULL, original_url TEXT, file_uri TEXT NOT NULL, cache_state TEXT NOT NULL, file_name TEXT, link_state TEXT NOT NULL DEFAULT 'linked', preview_file_name TEXT, preview_mime_type TEXT)",
		"CREATE TABLE IF NOT EXISTS source_items (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id), source_id TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', storage_state TEXT NOT NULL, created_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS picks (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id), source_id TEXT NOT NULL REFERENCES sources(id), source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE, modality TEXT NOT NULL, pick_type TEXT NOT NULL, metadata_json TEXT NOT NULL, picked_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS source_packs (id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, output_path TEXT NOT NULL, created_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS source_pack_items (source_pack_id TEXT NOT NULL REFERENCES source_packs(id) ON DELETE CASCADE, source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE, PRIMARY KEY (source_pack_id, source_item_id))",
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	// These upgrades are intentionally best-effort for existing Node-created databases.
	_, _ = db.Exec("ALTER TABLE resources ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE assets ADD COLUMN link_state TEXT NOT NULL DEFAULT 'linked'")
	_, _ = db.Exec("ALTER TABLE assets ADD COLUMN preview_file_name TEXT")
	_, _ = db.Exec("ALTER TABLE assets ADD COLUMN preview_mime_type TEXT")
	_, _ = db.Exec("UPDATE assets SET cache_state='pending' WHERE cache_state='external_reference'")
	_, _ = db.Exec("UPDATE assets SET link_state='none' WHERE original_url IS NULL")
	_, _ = db.Exec("UPDATE picks SET modality='link' WHERE modality='page'")
	_, _ = db.Exec("UPDATE resources SET kind='webpage' WHERE id IN (SELECT resource_id FROM picks WHERE modality='link' AND pick_type!='local_import')")
	_, _ = db.Exec("UPDATE picks SET modality=COALESCE((SELECT CASE WHEN mime_type LIKE 'image/%' THEN 'image' WHEN mime_type LIKE 'video/%' THEN 'video' WHEN mime_type LIKE 'audio/%' THEN 'audio' WHEN mime_type LIKE 'text/%' OR mime_type IN ('application/rtf','text/markdown') THEN 'text' END FROM assets WHERE assets.resource_id=picks.resource_id),modality) WHERE pick_type='local_import'")
	return nil
}

func backupFiles(root string) ([]BackupFile, error) {
	files := []BackupFile{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() || strings.HasSuffix(path, "-wal") || strings.HasSuffix(path, "-shm") {
			return err
		}
		bytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		files = append(files, BackupFile{Path: filepath.ToSlash(relative), Bytes: base64.StdEncoding.EncodeToString(bytes), Size: len(bytes), SHA256: digest(bytes)})
		return nil
	})
	return files, err
}

func writeBackupLibrary(root string, payload BackupPayload) error {
	if err := os.MkdirAll(filepath.Join(root, "books"), 0o755); err != nil {
		return err
	}
	books := make([]Book, 0, len(payload.Books))
	for _, backup := range payload.Books {
		if err := writeBackupBook(root, backup.Book, backup.Files); err != nil {
			return err
		}
		books = append(books, backup.Book)
	}
	manifest := Manifest{Version: libraryVersion, ActiveBookID: payload.Library.ActiveBookID, Books: books}
	bytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "library.json"), bytes, 0o644)
}

func writeBackupBook(root string, book Book, files []BackupFile) error {
	destination := filepath.Join(root, "books", bookDirectory(book))
	for _, file := range files {
		if filepath.IsAbs(file.Path) || strings.Contains(filepath.Clean(file.Path), "..") {
			return errors.New("备份包含非法路径")
		}
		bytes, err := base64.StdEncoding.DecodeString(file.Bytes)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, filepath.FromSlash(file.Path))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, bytes, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func digest(value []byte) string {
	hash := sha256.Sum256(value)
	return hex.EncodeToString(hash[:])
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	output, err := os.Create(destination)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyDirectory(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func containsBook(books []Book, id string) bool {
	for _, book := range books {
		if book.ID == id {
			return true
		}
	}
	return false
}

func cleanBookName(value string) string {
	return truncate(strings.Join(strings.Fields(value), " "), 80)
}

func slug(value string) string {
	value = strings.ToLower(value)
	var builder strings.Builder
	dash := false
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') {
			builder.WriteRune(character)
			dash = false
		} else if !dash {
			builder.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func bookDirectory(book Book) string {
	if isSafeBookDirectory(book.Directory) {
		return book.Directory
	}
	return book.ID
}

func normalizeBookDirectories(manifest *Manifest) {
	for index := range manifest.Books {
		book := &manifest.Books[index]
		if !isSafeBookDirectory(book.Directory) {
			// Existing libraries used the stable ID as their folder name. Preserve
			// that location during this schema addition rather than moving data on
			// application startup.
			book.Directory = book.ID
		}
	}
}

func nextBookDirectory(name string, books []Book, excludeID string) string {
	base := safeBookDirectory(name)
	if base == "" {
		base = "Book"
	}
	candidate := base
	for suffix := 2; ; suffix++ {
		conflict := false
		for _, book := range books {
			if book.ID != excludeID && strings.EqualFold(bookDirectory(book), candidate) {
				conflict = true
				break
			}
		}
		if !conflict {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, suffix)
	}
}

func safeBookDirectory(value string) string {
	value = strings.TrimSpace(value)
	var builder strings.Builder
	for _, character := range value {
		if character < 32 || strings.ContainsRune(`<>:"/\\|?*`, character) {
			continue
		}
		builder.WriteRune(character)
	}
	result := strings.TrimRight(strings.TrimSpace(builder.String()), ". ")
	if result == "." || result == ".." {
		return ""
	}
	if isWindowsReservedDirectory(result) {
		result += " Book"
	}
	return truncate(result, 80)
}

func isSafeBookDirectory(value string) bool {
	return value != "" && value == safeBookDirectory(value) && filepath.Base(value) == value
}

func isWindowsReservedDirectory(value string) bool {
	stem := strings.ToUpper(strings.Split(value, ".")[0])
	if stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" {
		return true
	}
	for _, prefix := range []string{"COM", "LPT"} {
		if len(stem) == 4 && strings.HasPrefix(stem, prefix) && stem[3] >= '1' && stem[3] <= '9' {
			return true
		}
	}
	return false
}

func alignStagedBookDirectories(staging string, books []Book) error {
	for _, book := range books {
		current := filepath.Join(staging, "books", book.ID)
		destination := filepath.Join(staging, "books", bookDirectory(book))
		if current == destination {
			continue
		}
		if strings.EqualFold(book.ID, bookDirectory(book)) {
			// Case-only renames need an intermediate name on the usual
			// case-insensitive macOS and Windows filesystems.
			temporary := current + ".sourcebook-rename"
			if err := os.Rename(current, temporary); err != nil {
				return err
			}
			if err := os.Rename(temporary, destination); err != nil {
				_ = os.Rename(temporary, current)
				return err
			}
			continue
		}
		if _, err := os.Stat(destination); err == nil {
			return errors.New("备份中的 Book 文件夹名称重复")
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := os.Rename(current, destination); err != nil {
			return err
		}
	}
	return nil
}

func truncate(value string, maximum int) string {
	runes := []rune(value)
	if len(runes) <= maximum {
		return value
	}
	return string(runes[:maximum])
}

func sortedBooks(books []Book) []Book {
	result := append([]Book{}, books...)
	sort.Slice(result, func(left, right int) bool { return result[left].CreatedAt < result[right].CreatedAt })
	return result
}
