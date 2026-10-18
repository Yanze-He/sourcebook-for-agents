package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	bookSourceLimit  = 200
	defaultPageLimit = 60
	maxPageLimit     = 200
	maxMediaBytes    = 20 * 1024 * 1024
)

// LocalPickerExtensionID is derived from the public key in
// apps/picker/wxt.config.ts. Chrome Web Store packages cannot carry that key:
// the Store signs them with its own key and assigns ChromeWebStorePickerExtensionID.
// Browsers enforce these origins, letting the local service reject unrelated
// extensions without storing any secret material.
const (
	LocalPickerExtensionID          = "cehohknopnehbkiokoffhfjepaieapan"
	ChromeWebStorePickerExtensionID = "pkglhngkfkjblabnhgcioindjgffgfpf"
)

var sourceBookPattern = regexp.MustCompile(`^[\w-]+$`)

type Server struct {
	library            *Library
	webRoot            string
	settingsPath       string
	settingsMu         sync.Mutex
	libraryOperationMu sync.RWMutex
	changeMu           sync.Mutex
	changeSubscribers  map[string]map[chan struct{}]struct{}
	mcpMu              sync.Mutex
}

type apiError struct {
	status  int
	code    string
	message string
}

func (err *apiError) Error() string { return err.message }

func NewServer(library *Library, webRoot string) http.Handler {
	settingsRoot := filepath.Dir(library.root)
	if library.locationConfigPath != "" {
		// Keep desktop preferences beside the location configuration, rather than
		// inside a movable library. This keeps update preferences intact after a
		// successful library migration.
		settingsRoot = filepath.Dir(library.locationConfigPath)
	}
	server := &Server{library: library, webRoot: webRoot, settingsPath: filepath.Join(settingsRoot, "desktop-settings.json"), changeSubscribers: map[string]map[chan struct{}]struct{}{}}
	server.cleanupExpiredMCPContextFiles()
	return server
}

func (server *Server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/api/events" {
		server.serveRequest(response, request)
		return
	}
	if isExclusiveLibraryOperation(request) {
		server.libraryOperationMu.Lock()
		defer server.libraryOperationMu.Unlock()
	} else {
		server.libraryOperationMu.RLock()
		defer server.libraryOperationMu.RUnlock()
	}
	server.serveRequest(response, request)
}

func (server *Server) serveRequest(response http.ResponseWriter, request *http.Request) {
	if !allowedHost(request.Host) {
		writeJSON(response, http.StatusBadRequest, map[string]any{"error": "Host not allowed"})
		return
	}
	origin := request.Header.Get("Origin")
	if !allowedOrigin(origin, request.Host) {
		writeJSON(response, http.StatusForbidden, map[string]any{"error": "Origin not allowed"})
		return
	}
	if origin != "" {
		response.Header().Set("Access-Control-Allow-Origin", origin)
	}
	response.Header().Set("Vary", "Origin")
	response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	response.Header().Set("Access-Control-Allow-Headers", "content-type")
	if request.Method == http.MethodOptions {
		response.WriteHeader(http.StatusNoContent)
		return
	}

	if err := server.route(response, request); err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) {
			writeJSON(response, apiErr.status, map[string]any{"error": apiErr.message, "code": apiErr.code})
			return
		}
		writeJSON(response, http.StatusInternalServerError, map[string]any{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
}

func isExclusiveLibraryOperation(request *http.Request) bool {
	return request.URL.Path == "/api/library" && request.Method == http.MethodDelete ||
		request.URL.Path == "/api/library/restore" && request.Method == http.MethodPost ||
		request.URL.Path == "/api/library/migrate" && request.Method == http.MethodPost ||
		request.URL.Path == "/api/settings/library" && request.Method == http.MethodPut
}

func (server *Server) route(response http.ResponseWriter, request *http.Request) error {
	path := request.URL.Path
	// MCP bridge requests deliberately use a separate, versioned API.  They are
	// authenticated with a pairing credential and are not available to web
	// pages or the Picker through the regular browser API.
	if strings.HasPrefix(path, "/api/mcp/v1/") {
		return server.routeMCPBridge(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/health" {
		manifest, err := server.library.List()
		if err != nil {
			return err
		}
		writeJSON(response, http.StatusOK, map[string]any{
			"ok": true, "app": "sourcebook-for-agents", "version": appVersion, "build": appBuild, "apiVersion": "3",
			"capabilities": []string{"picks", "sources", "source-packs", "books", "backup", "picker-auto-sync", "prompt-settings"},
			"connection":   map[string]any{"protocolVersion": 1, "origin": "http://" + request.Host},
			"library":      manifest,
		})
		return nil
	}
	if request.Method == http.MethodGet && path == "/api/events" {
		return server.streamSourceEvents(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/books" {
		return server.listBooks(response)
	}
	if request.Method == http.MethodGet && path == "/api/settings/prompt" {
		return server.getPromptSettings(response)
	}
	if request.Method == http.MethodPut && path == "/api/settings/prompt" {
		return server.updatePromptSettings(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/settings/library" {
		return server.getLibrarySettings(response)
	}
	if request.Method == http.MethodPut && path == "/api/settings/library" {
		return server.updateLibrarySettings(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/settings/library/choose" {
		return server.chooseLibraryLocation(response)
	}
	if request.Method == http.MethodPost && path == "/api/settings/library/reveal" {
		return server.revealLibraryLocation(response)
	}
	if request.Method == http.MethodGet && path == "/api/settings/update" {
		return server.getUpdateSettings(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/settings/mcp" {
		return server.getMCPSettings(response)
	}
	if request.Method == http.MethodPost && path == "/api/settings/mcp" {
		return server.enableMCP(response, request)
	}
	if request.Method == http.MethodDelete && path == "/api/settings/mcp" {
		return server.revokeMCP(response)
	}
	if request.Method == http.MethodGet && path == "/api/mcp/suggestions" {
		return server.listMCPSuggestions(response)
	}
	if request.Method == http.MethodPut && path == "/api/settings/update" {
		return server.updateUpdateSettings(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/books" {
		return server.createBook(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/library/backup" {
		return server.backup(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/library/restore" {
		return server.restore(response, request)
	}
	if request.Method == http.MethodDelete && path == "/api/library" {
		return server.resetLibrary(response)
	}
	if request.Method == http.MethodPost && path == "/api/library/migrate" {
		return server.migrateLibrary(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/picks" {
		return server.savePick(response, request, true)
	}
	if request.Method == http.MethodGet && path == "/api/sources" {
		return server.listSources(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/sources" {
		return server.createSource(response, request)
	}
	if request.Method == http.MethodDelete && path == "/api/sources" {
		return server.deleteSources(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/source-packs" {
		return server.createPack(response, request)
	}
	if request.Method == http.MethodGet && path == "/api/source-packs" {
		return server.listPacks(response, request)
	}
	if request.Method == http.MethodPost && path == "/api/source-packs/copy-materials" {
		return server.copyPackMaterials(response, request)
	}

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "books" && sourceBookPattern.MatchString(parts[2]) {
		bookID := parts[2]
		if len(parts) == 3 {
			switch request.Method {
			case http.MethodPatch:
				return server.renameBook(response, request, bookID)
			case http.MethodDelete:
				return server.deleteBook(response, bookID)
			}
		}
		if len(parts) == 4 && parts[3] == "activate" && request.Method == http.MethodPost {
			return server.activateBook(response, bookID)
		}
		if len(parts) == 4 && parts[3] == "import" && request.Method == http.MethodPost {
			return server.importFile(response, request, bookID)
		}
		if len(parts) == 5 && parts[3] == "media" && request.Method == http.MethodGet {
			return server.serveMedia(response, bookID, parts[4])
		}
		if len(parts) == 6 && parts[3] == "sources" && parts[5] == "preview" && request.Method == http.MethodGet {
			return server.previewSource(response, bookID, parts[4])
		}
		if len(parts) == 6 && parts[3] == "sources" && parts[5] == "transfer" && request.Method == http.MethodPost {
			return server.transferSource(response, request, bookID, parts[4])
		}
	}
	if len(parts) == 3 && parts[0] == "api" && parts[1] == "media" && request.Method == http.MethodGet {
		return server.serveMedia(response, request.URL.Query().Get("bookId"), parts[2])
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "sources" && request.Method == http.MethodPatch {
		return server.updateSource(response, request, parts[2], parts[3])
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "sources" && request.Method == http.MethodPost {
		return server.sourceAction(response, request, parts[2], parts[3])
	}
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "mcp" && parts[2] == "suggestions" && sourceBookPattern.MatchString(parts[3]) && parts[5] == "preview" && request.Method == http.MethodGet {
		return server.previewMCPSuggestion(response, request, parts[3], parts[4])
	}
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "mcp" && parts[2] == "suggestions" && sourceBookPattern.MatchString(parts[3]) && request.Method == http.MethodPost {
		if parts[5] == "accept" || parts[5] == "reject" {
			return server.reviewMCPSuggestion(response, request, parts[3], parts[4], parts[5])
		}
	}

	if request.Method == http.MethodGet && server.webRoot != "" {
		return serveWebsite(response, request, server.webRoot)
	}
	return &apiError{status: http.StatusNotFound, code: "NOT_FOUND", message: "Not found"}
}

func (server *Server) listBooks(response http.ResponseWriter) error {
	manifest, err := server.library.List()
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, manifest)
	return nil
}

type desktopSettings struct {
	PromptTemplate   string        `json:"promptTemplate,omitempty"`
	AutoUpdateCheck  *bool         `json:"autoUpdateCheck,omitempty"`
	LastUpdateCheck  string        `json:"lastUpdateCheck,omitempty"`
	UpdateError      string        `json:"updateError,omitempty"`
	AvailableRelease *releaseInfo  `json:"availableRelease,omitempty"`
	MCPEnabled       bool          `json:"mcpEnabled,omitempty"`
	MCPToken         string        `json:"mcpToken,omitempty"`
	MCPServiceURL    string        `json:"mcpServiceUrl,omitempty"`
	MCPEnabledAt     string        `json:"mcpEnabledAt,omitempty"`
	MCPActivity      []mcpActivity `json:"mcpActivity,omitempty"`
}

func (server *Server) getPromptSettings(response http.ResponseWriter) error {
	settings, err := server.readDesktopSettings()
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"template": settings.PromptTemplate})
	return nil
}

func (server *Server) updatePromptSettings(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	template := strings.TrimSpace(stringValue(value["template"]))
	if len([]byte(template)) > 64*1024 {
		return &apiError{status: http.StatusBadRequest, code: "PROMPT_TEMPLATE_TOO_LARGE", message: "提示词模板不能超过 64 KB。"}
	}
	settings, err := server.readDesktopSettings()
	if err != nil {
		return err
	}
	settings.PromptTemplate = template
	settings, err = server.writeDesktopSettings(settings)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"template": settings.PromptTemplate})
	return nil
}

func (server *Server) readDesktopSettings() (desktopSettings, error) {
	server.settingsMu.Lock()
	defer server.settingsMu.Unlock()
	return readDesktopSettingsFile(server.settingsPath)
}

func (server *Server) writeDesktopSettings(settings desktopSettings) (desktopSettings, error) {
	server.settingsMu.Lock()
	defer server.settingsMu.Unlock()
	if settings.PromptTemplate == "" && settings.AutoUpdateCheck == nil && settings.LastUpdateCheck == "" && settings.UpdateError == "" && settings.AvailableRelease == nil && !settings.MCPEnabled && settings.MCPToken == "" && settings.MCPServiceURL == "" && settings.MCPEnabledAt == "" && len(settings.MCPActivity) == 0 {
		if err := os.Remove(server.settingsPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return desktopSettings{}, err
		}
		return desktopSettings{}, nil
	}
	if err := os.MkdirAll(filepath.Dir(server.settingsPath), 0o755); err != nil {
		return desktopSettings{}, err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return desktopSettings{}, err
	}
	file, err := os.CreateTemp(filepath.Dir(server.settingsPath), ".desktop-settings-*")
	if err != nil {
		return desktopSettings{}, err
	}
	temporaryPath := file.Name()
	defer os.Remove(temporaryPath)
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return desktopSettings{}, err
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return desktopSettings{}, err
	}
	if err := file.Close(); err != nil {
		return desktopSettings{}, err
	}
	if err := os.Rename(temporaryPath, server.settingsPath); err != nil {
		return desktopSettings{}, err
	}
	return settings, nil
}

func readDesktopSettingsFile(path string) (desktopSettings, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return desktopSettings{}, nil
	}
	if err != nil {
		return desktopSettings{}, err
	}
	settings := desktopSettings{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return desktopSettings{}, errors.New("提示词设置文件无法读取，请在设置中恢复默认后重试。")
	}
	return settings, nil
}

func (server *Server) createBook(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	book, err := server.library.CreateBook(stringValue(value["name"]))
	if err != nil {
		return err
	}
	_, err = server.library.Context(book.ID)
	if err != nil {
		return err
	}
	if request.URL.Query().Get("source") == "picker" {
		if _, err := server.library.MarkUnread(book.ID); err != nil {
			return err
		}
	}
	writeJSON(response, http.StatusCreated, map[string]any{"book": book})
	return nil
}

func (server *Server) renameBook(response http.ResponseWriter, request *http.Request, bookID string) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	book, err := server.library.RenameBook(bookID, stringValue(value["name"]))
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"book": book})
	return nil
}

func (server *Server) activateBook(response http.ResponseWriter, bookID string) error {
	manifest, err := server.library.SetActive(bookID)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, manifest)
	return nil
}

func (server *Server) deleteBook(response http.ResponseWriter, bookID string) error {
	manifest, err := server.library.DeleteBook(bookID)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"activeBookId": manifest.ActiveBookID, "books": manifest.Books, "deletedBookId": bookID})
	return nil
}

func (server *Server) backup(response http.ResponseWriter, request *http.Request) error {
	response.Header().Set("content-type", "application/vnd.sourcebook.backup")
	response.Header().Set("content-disposition", fmt.Sprintf("attachment; filename=sourcebook-%s.sourcebook-backup", time.Now().UTC().Format("2006-01-02")))
	return server.library.WriteBackup(response, requestBookIDs(request)...)
}

func requestBookIDs(request *http.Request) []string {
	return request.URL.Query()["bookId"]
}

func (server *Server) restore(response http.ResponseWriter, request *http.Request) error {
	mode := request.URL.Query().Get("mode")
	var manifest Manifest
	var imported []Book
	var err error
	if strings.HasPrefix(request.Header.Get("content-type"), "application/octet-stream") {
		defer request.Body.Close()
		manifest, imported, err = server.library.RestoreArchive(request.Body, mode)
	} else {
		value, bodyErr := readBody(request)
		if bodyErr != nil {
			return bodyErr
		}
		data, decodeErr := base64.StdEncoding.DecodeString(stringValue(value["archive"]))
		if decodeErr != nil {
			return errors.New("不是有效的 Sourcebook 备份文件")
		}
		mode = firstString(mode, stringValue(value["mode"]))
		manifest, imported, err = server.library.Restore(data, mode)
	}
	if err != nil {
		return err
	}
	result := map[string]any{"activeBookId": manifest.ActiveBookID, "books": manifest.Books}
	if len(imported) > 0 {
		result["imported"] = imported
	}
	writeJSON(response, http.StatusOK, result)
	return nil
}

func (server *Server) resetLibrary(response http.ResponseWriter) error {
	manifest, err := server.library.Reset()
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"activeBookId": manifest.ActiveBookID, "books": manifest.Books})
	return nil
}

func (server *Server) migrateLibrary(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	targetRoot, err := server.library.Migrate(stringValue(value["destination"]))
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"targetRoot": targetRoot, "restartRequired": true})
	return nil
}

func (server *Server) context(bookID string, required bool) (*BookContext, error) {
	if required && bookID == "" {
		return nil, &apiError{status: http.StatusBadRequest, code: "BOOK_REQUIRED", message: "请选择保存到哪个 Book。"}
	}
	if bookID == "" {
		manifest, err := server.library.List()
		if err != nil {
			return nil, err
		}
		bookID = manifest.ActiveBookID
	}
	ctx, err := server.library.Context(bookID)
	if err != nil {
		return nil, &apiError{status: http.StatusNotFound, code: "BOOK_NOT_FOUND", message: err.Error()}
	}
	return ctx, nil
}

func (server *Server) createSource(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	ctx, err := server.context(stringValue(value["bookId"]), false)
	if err != nil {
		return err
	}
	if file, ok := objectValue(value["file"]); ok && stringValue(file["contentBase64"]) != "" {
		result, err := importLocalFile(ctx, file)
		if err != nil {
			return err
		}
		if title := stringValue(value["title"]); title != "" {
			_, err = updateTitle(ctx, stringValue(result["sourceItemId"]), title)
			if err != nil {
				return err
			}
		}
		if note := firstString(value["note"], value["userNote"]); note != "" {
			if err := updateNote(ctx, stringValue(result["sourceItemId"]), note); err != nil {
				return err
			}
		}
		writeJSON(response, http.StatusCreated, result)
		return nil
	}
	value["sourceType"] = firstString(value["sourceType"], "manual")
	value["pickType"] = firstString(value["pickType"], "manual_create")
	value["sourceUrl"] = firstString(value["sourceUrl"], "sourcebook://manual/"+newID())
	value["sourceTitle"] = firstString(value["sourceTitle"], value["sourceLabel"], "Manual Source")
	value["userNote"] = firstString(value["note"], value["userNote"])
	result, err := savePick(ctx, value)
	if err != nil {
		return err
	}
	if stringValue(result["status"]) == "saved" {
		server.publishSourceChange(ctx.Book.ID)
	}
	writeJSON(response, http.StatusCreated, result)
	return nil
}

func (server *Server) streamSourceEvents(response http.ResponseWriter, request *http.Request) error {
	bookID := request.URL.Query().Get("bookId")
	if !sourceBookPattern.MatchString(bookID) {
		return &apiError{status: http.StatusBadRequest, code: "INVALID_BOOK", message: "Book 无效"}
	}
	if _, err := server.context(bookID, true); err != nil {
		return err
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		return &apiError{status: http.StatusInternalServerError, code: "STREAM_UNAVAILABLE", message: "实时同步不可用"}
	}

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Connection", "keep-alive")
	changes, unsubscribe := server.subscribeSourceChanges(bookID)
	defer unsubscribe()
	_, _ = fmt.Fprint(response, "retry: 3000\n\n")
	flusher.Flush()

	keepAlive := time.NewTicker(25 * time.Second)
	defer keepAlive.Stop()
	for {
		select {
		case <-request.Context().Done():
			return nil
		case <-changes:
			_, _ = fmt.Fprint(response, "event: sources\ndata: {}\n\n")
			flusher.Flush()
		case <-keepAlive.C:
			_, _ = fmt.Fprint(response, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}

func (server *Server) subscribeSourceChanges(bookID string) (<-chan struct{}, func()) {
	changes := make(chan struct{}, 1)
	server.changeMu.Lock()
	if server.changeSubscribers[bookID] == nil {
		server.changeSubscribers[bookID] = map[chan struct{}]struct{}{}
	}
	server.changeSubscribers[bookID][changes] = struct{}{}
	server.changeMu.Unlock()

	return changes, func() {
		server.changeMu.Lock()
		defer server.changeMu.Unlock()
		delete(server.changeSubscribers[bookID], changes)
		if len(server.changeSubscribers[bookID]) == 0 {
			delete(server.changeSubscribers, bookID)
		}
	}
}

func (server *Server) publishSourceChange(bookID string) {
	server.changeMu.Lock()
	defer server.changeMu.Unlock()
	for subscriber := range server.changeSubscribers[bookID] {
		select {
		case subscriber <- struct{}{}:
		default:
		}
	}
}

func (server *Server) savePick(response http.ResponseWriter, request *http.Request, requireBook bool) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	ctx, err := server.context(stringValue(value["bookId"]), requireBook)
	if err != nil {
		return err
	}
	result, err := savePick(ctx, value)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusCreated, result)
	return nil
}

func savePick(ctx *BookContext, value map[string]any) (map[string]any, error) {
	modality := stringValue(value["modality"])
	if modality == "page" {
		modality = "link"
	}
	if !validModality(modality) || stringValue(value["sourceUrl"]) == "" || stringValue(value["pickType"]) == "" {
		return nil, errors.New("Invalid Pick payload")
	}
	contentText := stringValue(value["contentText"])
	contentURL := stringValue(value["contentUrl"])
	pageMetadata, _ := objectValue(value["pageMetadata"])
	identity := contentURL
	if modality == "link" {
		identity = firstString(pageMetadata["canonicalUrl"], contentURL, stringValue(value["sourceUrl"]))
	} else if modality == "post" {
		post, _ := objectValue(value["post"])
		postID := ""
		if platform, externalID := stringValue(post["platform"]), stringValue(post["externalId"]); platform != "" && externalID != "" {
			postID = platform + ":" + externalID
		}
		identity = firstString(postID, pageMetadata["canonicalUrl"], contentURL, stringValue(value["sourceUrl"]))
	} else if modality == "conversation" {
		identity = stringValue(value["sourceUrl"]) + "\n" + strings.ToLower(strings.Join(strings.Fields(contentText), " "))
	} else if identity == "" {
		identity = firstString(strings.ToLower(strings.Join(strings.Fields(contentText), " ")), stringValue(value["sourceUrl"]))
	}
	hash := hashString(modality + "\n" + identity)
	var existingID string
	err := ctx.DB.QueryRow("SELECT id FROM resources WHERE content_hash=?", hash).Scan(&existingID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if modality == "conversation" && existingID != "" {
		var sourceItemID, pickID string
		err = ctx.DB.QueryRow(`SELECT source_items.id,picks.id FROM picks JOIN source_items ON source_items.id=picks.source_item_id JOIN sources ON sources.id=source_items.source_id WHERE picks.resource_id=? AND picks.modality='conversation' AND sources.url=? ORDER BY picks.picked_at DESC LIMIT 1`, existingID, stringValue(value["sourceUrl"])).Scan(&sourceItemID, &pickID)
		if err == nil {
			return map[string]any{"sourceItemId": sourceItemID, "pickId": pickID, "resourceId": existingID, "status": "duplicate"}, nil
		}
	}
	if err := ensureCapacity(ctx); err != nil {
		return nil, err
	}
	suffix := newID()
	sourceID, sourceItemID, pickID := "source-"+suffix, "source-item-"+suffix, "pick-"+suffix
	resourceID := existingID
	if resourceID == "" {
		resourceID = "resource-" + suffix
	}
	pickedAt := firstString(value["pickedAt"], now())
	title := titleFor(value, modality)
	metadata := mergeMetadata(value, modality)

	tx, err := ctx.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer rollback(tx)
	if _, err = tx.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", sourceID, firstString(value["sourceLabel"], host(stringValue(value["sourceUrl"]))), stringValue(value["sourceUrl"]), pickedAt); err != nil {
		return nil, err
	}
	if existingID == "" {
		if _, err = tx.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)", resourceID, kindFor(modality), sourceID, title, summaryFor(value, modality), hash, pickedAt); err != nil {
			return nil, err
		}
		if contentText != "" && modality != "link" && modality != "image" && modality != "video" {
			if _, err = tx.Exec("INSERT INTO text_contents (resource_id,text) VALUES (?,?)", resourceID, contentText); err != nil {
				return nil, err
			}
		}
		shouldAddAsset := (modality == "image" || modality == "video" || modality == "audio") && firstString(contentURL, stringValue(value["thumbnailUrl"])) != ""
		// Posts do not download their remote media, but a cover received from the
		// Picker is a portable preview and should survive a later CDN expiry.
		if modality == "post" && stringValue(value["thumbnailBase64"]) != "" {
			shouldAddAsset = true
		}
		if shouldAddAsset {
			originalURL := firstString(contentURL, stringValue(value["thumbnailUrl"]))
			if modality == "post" {
				originalURL = firstString(stringValue(value["thumbnailUrl"]), contentURL)
			}
			if err = addAsset(tx, ctx, resourceID, suffix, title, value, modality, originalURL); err != nil {
				return nil, err
			}
		}
	}
	if _, err = tx.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", sourceItemID, resourceID, sourceID, title, firstString(value["userNote"], value["note"]), "available", pickedAt); err != nil {
		return nil, err
	}
	if _, exists := value["favorite"]; exists {
		if _, err = tx.Exec("UPDATE resources SET favorite=? WHERE id=?", boolToInt(boolValue(value["favorite"])), resourceID); err != nil {
			return nil, err
		}
	}
	metadataBytes, _ := json.Marshal(metadata)
	if _, err = tx.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", pickID, resourceID, sourceID, sourceItemID, modality, stringValue(value["pickType"]), string(metadataBytes), pickedAt); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	result := map[string]any{"sourceItemId": sourceItemID, "resourceId": resourceID, "pickId": pickID, "status": "saved"}
	if existingID != "" {
		result["status"] = "duplicate"
	}
	if modality == "image" {
		if stringValue(value["contentBase64"]) != "" {
			result["cacheState"] = "cached"
		} else {
			result["cacheState"] = "pending"
		}
	}
	return result, nil
}

func addAsset(tx *sql.Tx, ctx *BookContext, resourceID, suffix, title string, value map[string]any, modality, originalURL string) error {
	assetID := "asset-" + suffix
	if modality == "image" && stringValue(value["contentBase64"]) != "" {
		bytes, err := base64.StdEncoding.DecodeString(stringValue(value["contentBase64"]))
		if err != nil || len(bytes) == 0 {
			return errors.New("图片内容无效")
		}
		if len(bytes) > maxMediaBytes {
			return errors.New("图片超过 20 MB")
		}
		mimeType, extension, err := imageType(bytes)
		if err != nil {
			return err
		}
		fileName := safeName(title, extension, assetID)
		if err := os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), bytes, 0o644); err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)", assetID, resourceID, mimeType, originalURL, "/api/books/"+ctx.Book.ID+"/media/"+assetID, "cached", fileName, "linked")
		return err
	}
	mimeType := map[string]string{"image": "image/*", "audio": "audio/*", "video": "video/*", "post": "image/*"}[modality]
	var previewFileName, previewMimeType any
	if (modality == "video" || modality == "post") && stringValue(value["thumbnailBase64"]) != "" {
		bytes, err := base64.StdEncoding.DecodeString(stringValue(value["thumbnailBase64"]))
		if err != nil || len(bytes) == 0 {
			return errors.New("素材封面无效")
		}
		if len(bytes) > maxMediaBytes {
			return errors.New("素材封面超过 20 MB")
		}
		previewMime, extension, err := imageType(bytes)
		if err != nil {
			return err
		}
		fileName := safeName(title+"-cover", extension, assetID)
		if err := os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), bytes, 0o644); err != nil {
			return err
		}
		previewFileName, previewMimeType = fileName, previewMime
	}
	_, err := tx.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state,preview_file_name,preview_mime_type) VALUES (?,?,?,?,?,?,?,?,?,?)", assetID, resourceID, mimeType, originalURL, originalURL, "pending", nil, "linked", previewFileName, previewMimeType)
	return err
}

func (server *Server) importFile(response http.ResponseWriter, request *http.Request, bookID string) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	ctx, err := server.context(bookID, true)
	if err != nil {
		return err
	}
	result, err := importLocalFile(ctx, value)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusCreated, result)
	return nil
}

func importLocalFile(ctx *BookContext, value map[string]any) (map[string]any, error) {
	name := truncate(filepath.Base(stringValue(value["name"])), 180)
	mimeType, modality, ok := localImportFormat(name)
	if !ok {
		return nil, errors.New("Unsupported format. Supported: JPG, PNG, WEBP, GIF, MP3, WAV, M4A, AAC, FLAC, OGG, MP4, MOV, WEBM, PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, RTF, JSON, HTML.")
	}
	bytes, err := base64.StdEncoding.DecodeString(stringValue(value["contentBase64"]))
	if err != nil || name == "" || len(bytes) == 0 {
		return nil, errors.New("请选择有效的本地文件")
	}
	if len(bytes) > maxMediaBytes {
		return nil, errors.New("单个文件暂不支持超过 20 MB")
	}
	if err := ensureCapacity(ctx); err != nil {
		return nil, err
	}
	hash := digest(bytes)
	var existingID string
	err = ctx.DB.QueryRow("SELECT id FROM resources WHERE content_hash=?", hash).Scan(&existingID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	suffix := newID()
	sourceID, sourceItemID, pickID := "source-"+suffix, "source-item-"+suffix, "pick-"+suffix
	resourceID := existingID
	if resourceID == "" {
		resourceID = "resource-" + suffix
	}
	pickedAt := now()
	title := strings.TrimSuffix(name, filepath.Ext(name))
	if title == "" {
		title = name
	}
	tx, err := ctx.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer rollback(tx)
	if _, err = tx.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", sourceID, "Local file", "sourcebook://local/"+url.PathEscape(name), pickedAt); err != nil {
		return nil, err
	}
	if existingID == "" {
		if _, err = tx.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)", resourceID, "file", sourceID, title, "", hash, pickedAt); err != nil {
			return nil, err
		}
		assetID := "asset-" + suffix
		fileName := safeName(title, filepath.Ext(name), assetID)
		if err = os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), bytes, 0o644); err != nil {
			return nil, err
		}
		if _, err = tx.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)", assetID, resourceID, mimeType, nil, "/api/books/"+ctx.Book.ID+"/media/"+assetID, "cached", fileName, "none"); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", sourceItemID, resourceID, sourceID, title, "", "available", pickedAt); err != nil {
		return nil, err
	}
	if _, err = tx.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", pickID, resourceID, sourceID, sourceItemID, modality, "local_import", "{}", pickedAt); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return map[string]any{"sourceItemId": sourceItemID, "resourceId": resourceID, "pickId": pickID, "status": map[bool]string{true: "duplicate", false: "saved"}[existingID != ""]}, nil
}

func (server *Server) listSources(response http.ResponseWriter, request *http.Request) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	result, err := sourceItems(ctx, request.URL.Query().Get("limit"), request.URL.Query().Get("cursor"))
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, result)
	return nil
}

func sourceItems(ctx *BookContext, limitValue, cursorValue string) (map[string]any, error) {
	limit := defaultPageLimit
	if parsed, err := strconv.Atoi(limitValue); err == nil && parsed > 0 {
		limit = min(parsed, maxPageLimit)
	}
	createdAt, id, err := decodeCursor(cursorValue)
	if err != nil {
		return nil, err
	}
	query := `SELECT source_items.id,source_items.resource_id,source_items.title,source_items.note,source_items.storage_state,source_items.created_at,resources.favorite,resources.summary,picks.modality,picks.pick_type,picks.metadata_json,text_contents.text,assets.id,assets.mime_type,assets.original_url,assets.file_uri,assets.cache_state,assets.link_state,assets.file_name,assets.preview_file_name,assets.preview_mime_type,sources.url,sources.label FROM source_items JOIN resources ON resources.id=source_items.resource_id JOIN picks ON picks.source_item_id=source_items.id JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id LEFT JOIN assets ON assets.resource_id=source_items.resource_id`
	args := []any{}
	if createdAt != "" {
		query += " WHERE (source_items.created_at < ? OR (source_items.created_at = ? AND source_items.id < ?))"
		args = append(args, createdAt, createdAt, id)
	}
	query += " ORDER BY source_items.created_at DESC,source_items.id DESC LIMIT ?"
	args = append(args, limit+1)
	rows, err := ctx.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var itemID, resourceID, itemTitle, note, status, pickedAt, summary, modality, pickType, metadataJSON string
		var favorite int
		var contentText, assetID, mimeType, contentURL, thumbnailURL, cacheState, linkState, fileName, previewFileName, previewMimeType, sourceURL, sourceTitle sql.NullString
		if err := rows.Scan(&itemID, &resourceID, &itemTitle, &note, &status, &pickedAt, &favorite, &summary, &modality, &pickType, &metadataJSON, &contentText, &assetID, &mimeType, &contentURL, &thumbnailURL, &cacheState, &linkState, &fileName, &previewFileName, &previewMimeType, &sourceURL, &sourceTitle); err != nil {
			return nil, err
		}
		metadata := map[string]any{}
		_ = json.Unmarshal([]byte(metadataJSON), &metadata)
		isLocal := pickType == "local_import" || (fileName.Valid && strings.HasPrefix(sourceURL.String, "sourcebook://local/"))
		effectiveModality := modality
		if isLocal && modality != "image" && modality != "video" && modality != "audio" {
			effectiveModality = "file"
		}
		localPath := ""
		var fileSize any = nil
		if fileName.Valid {
			localPath = filepath.Join(ctx.MediaRoot, fileName.String)
			if info, err := os.Stat(localPath); err == nil {
				fileSize = info.Size()
			} else if cacheState.String == "cached" {
				cacheState.String = "missing"
			}
		}
		previewURL := ""
		if effectiveModality == "video" {
			previewURL = externalURL(metadata["mediaPreviewUrl"])
			if previewURL == "" {
				previewURL = externalURL(metadata["videoPreviewUrl"])
			}
			if previewURL == "" {
				previewURL = externalURL(metadata["ogImage"])
			}
		} else if effectiveModality == "post" {
			previewURL = externalURL(postThumbnail(metadata))
		}
		if effectiveModality == "video" || effectiveModality == "post" {
			if previewFileName.Valid && previewMimeType.Valid {
				previewURL = "/api/books/" + ctx.Book.ID + "/sources/" + itemID + "/preview"
			} else if previewURL != "" {
				metadata["mediaPreviewUrl"] = previewURL
				previewURL = "/api/books/" + ctx.Book.ID + "/sources/" + itemID + "/preview"
			}
		}
		thumbnail := nullableString(thumbnailURL)
		if assetID.Valid && cacheState.String == "cached" && fileName.Valid {
			// Backups may be imported under a new Book ID. Build this URL from the
			// current Book and asset IDs instead of trusting a stored historic URI.
			thumbnail = "/api/books/" + ctx.Book.ID + "/media/" + assetID.String
		}
		if effectiveModality == "link" {
			// Link cards stay text-first, but the detail view can still show the
			// page's social preview image when the site provides one.
			if preview := externalURL(metadata["ogImage"]); preview != "" {
				thumbnail = preview
			} else {
				thumbnail = nil
			}
		} else if effectiveModality == "post" {
			if previewURL != "" {
				thumbnail = previewURL
			} else {
				thumbnail = postThumbnail(metadata)
			}
		} else if previewURL != "" {
			thumbnail = previewURL
		} else if cacheState.String == "missing" || cacheState.String == "failed" || cacheState.String == "pending" || cacheState.String == "downloading" {
			if contentURL.Valid {
				thumbnail = contentURL.String
			}
		}
		link := "none"
		if assetID.Valid {
			link = nullableOr(linkState, "linked")
		} else if strings.HasPrefix(sourceURL.String, "http://") || strings.HasPrefix(sourceURL.String, "https://") {
			link = "linked"
		}
		item := map[string]any{
			"id": itemID, "resourceId": resourceID, "itemTitle": itemTitle, "userNote": note, "status": status, "pickedAt": pickedAt,
			"favorite": favorite != 0, "resourceSummary": summary, "modality": effectiveModality, "pickType": pickType, "metadata": metadata,
			"assetCacheState": nullableString(cacheState), "linkState": link, "mimeType": nullableString(mimeType), "fileName": nullableString(fileName), "contentUrl": nullableString(contentURL),
			"thumbnailUrl": thumbnail, "sourceUrl": nullableString(sourceURL), "sourceTitle": nullableString(sourceTitle), "bookId": ctx.Book.ID,
			"sourceOrigin": originOf(sourceURL.String), "faviconUrl": nullableAny(metadata["faviconUrl"]), "localPath": nil, "fileSize": fileSize,
		}
		if effectiveModality != "link" && effectiveModality != "image" && effectiveModality != "video" {
			item["contentText"] = nullableString(contentText)
		} else {
			item["contentText"] = nil
		}
		if fileName.Valid {
			item["localPath"] = "assets/" + fileName.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	var total int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&total); err != nil {
		return nil, err
	}
	var nextCursor any
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		nextCursor = encodeCursor(stringValue(last["pickedAt"]), stringValue(last["id"]))
	}
	return map[string]any{"items": items, "total": total, "nextCursor": nextCursor, "limit": limit}, nil
}

func (server *Server) updateSource(response http.ResponseWriter, request *http.Request, sourceItemID, action string) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	value, err := readBody(request)
	if err != nil {
		return err
	}
	var result map[string]any
	switch action {
	case "note":
		err = updateNote(ctx, sourceItemID, stringValue(value["note"]))
		result = map[string]any{"ok": true}
	case "title":
		var title string
		title, err = updateTitle(ctx, sourceItemID, stringValue(value["title"]))
		result = map[string]any{"ok": true, "title": title}
	case "content":
		var text string
		text, err = updateContent(ctx, sourceItemID, stringValue(value["contentText"]))
		result = map[string]any{"ok": true, "contentText": text}
	case "favorite":
		err = updateFavorite(ctx, sourceItemID, boolValue(value["favorite"]))
		result = map[string]any{"ok": true, "favorite": boolValue(value["favorite"])}
	default:
		return &apiError{status: http.StatusNotFound, code: "NOT_FOUND", message: "Not found"}
	}
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, result)
	return nil
}

func updateNote(ctx *BookContext, sourceItemID, note string) error {
	result, err := ctx.DB.Exec("UPDATE source_items SET note=? WHERE id=?", strings.TrimSpace(note), sourceItemID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return errors.New("素材不存在")
	}
	return nil
}

func updateTitle(ctx *BookContext, sourceItemID, title string) (string, error) {
	title = truncate(strings.Join(strings.Fields(title), " "), 160)
	if title == "" {
		return "", errors.New("标题不能为空")
	}
	var resourceID string
	var fileName sql.NullString
	err := ctx.DB.QueryRow("SELECT source_items.resource_id,assets.file_name FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&resourceID, &fileName)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("素材不存在")
	}
	if err != nil {
		return "", err
	}
	if _, err = ctx.DB.Exec("UPDATE source_items SET title=? WHERE id=?", title, sourceItemID); err != nil {
		return "", err
	}
	if _, err = ctx.DB.Exec("UPDATE resources SET title=? WHERE id=?", title, resourceID); err != nil {
		return "", err
	}
	if fileName.Valid {
		oldPath := filepath.Join(ctx.MediaRoot, fileName.String)
		if _, err := os.Stat(oldPath); err == nil {
			next := safeName(title, filepath.Ext(fileName.String), fileName.String)
			if next != fileName.String {
				if err := os.Rename(oldPath, filepath.Join(ctx.MediaRoot, next)); err != nil {
					return "", err
				}
				if _, err := ctx.DB.Exec("UPDATE assets SET file_name=? WHERE resource_id=?", next, resourceID); err != nil {
					return "", err
				}
			}
		}
	}
	return title, nil
}

func updateContent(ctx *BookContext, sourceItemID, text string) (string, error) {
	text = strings.TrimSpace(text)
	var resourceID, modality string
	err := ctx.DB.QueryRow("SELECT source_items.resource_id,picks.modality FROM source_items JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id=?", sourceItemID).Scan(&resourceID, &modality)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("素材不存在")
	}
	if err != nil {
		return "", err
	}
	if modality == "image" || modality == "video" {
		return "", errors.New("图片和视频不支持正文内容")
	}
	result, err := ctx.DB.Exec("UPDATE text_contents SET text=? WHERE resource_id=?", text, resourceID)
	if err != nil {
		return "", err
	}
	changed, _ := result.RowsAffected()
	if changed == 0 {
		return "", errors.New("此素材不包含可编辑文字")
	}
	_, err = ctx.DB.Exec("UPDATE resources SET summary=? WHERE id=?", truncate(strings.Join(strings.Fields(text), " "), 240), resourceID)
	return text, err
}

func updateFavorite(ctx *BookContext, sourceItemID string, favorite bool) error {
	result, err := ctx.DB.Exec("UPDATE resources SET favorite=? WHERE id=(SELECT resource_id FROM source_items WHERE id=?)", boolToInt(favorite), sourceItemID)
	if err != nil {
		return err
	}
	changed, _ := result.RowsAffected()
	if changed == 0 {
		return errors.New("素材不存在")
	}
	return nil
}

func (server *Server) deleteSources(response http.ResponseWriter, request *http.Request) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	value, err := readBody(request)
	if err != nil {
		return err
	}
	ids := stringSlice(value["sourceItemIds"])
	if len(ids) == 0 {
		return errors.New("请选择要删除的素材")
	}
	deleted, err := removeItems(ctx, ids)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"ok": true, "deletedCount": deleted})
	return nil
}

func removeItems(ctx *BookContext, ids []string) (int, error) {
	marks, values := marks(ids)
	rows, err := ctx.DB.Query("SELECT source_items.resource_id,assets.file_name FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id IN ("+marks+")", values...)
	if err != nil {
		return 0, err
	}
	resources := map[string][]string{}
	count := 0
	for rows.Next() {
		var resourceID string
		var fileName sql.NullString
		if err := rows.Scan(&resourceID, &fileName); err != nil {
			_ = rows.Close()
			return 0, err
		}
		if fileName.Valid {
			resources[resourceID] = append(resources[resourceID], fileName.String)
		} else if _, exists := resources[resourceID]; !exists {
			resources[resourceID] = nil
		}
		count++
	}
	_ = rows.Close()
	tx, err := ctx.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer rollback(tx)
	// Early Sourcebook databases did not always declare these relationships with
	// ON DELETE CASCADE. Remove dependent rows explicitly so deleting or moving
	// an older Source never leaves a foreign-key reference behind.
	if _, err = tx.Exec("DELETE FROM source_pack_items WHERE source_item_id IN ("+marks+")", values...); err != nil {
		return 0, err
	}
	if _, err = tx.Exec("DELETE FROM picks WHERE source_item_id IN ("+marks+")", values...); err != nil {
		return 0, err
	}
	if _, err = tx.Exec("DELETE FROM source_items WHERE id IN ("+marks+")", values...); err != nil {
		return 0, err
	}
	files := []string{}
	for resourceID, names := range resources {
		var remaining int
		if err = tx.QueryRow("SELECT COUNT(*) FROM source_items WHERE resource_id=?", resourceID).Scan(&remaining); err != nil {
			return 0, err
		}
		if remaining == 0 {
			files = append(files, names...)
			if _, err = tx.Exec("DELETE FROM resources WHERE id=?", resourceID); err != nil {
				return 0, err
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	for _, file := range files {
		moveToTrash(filepath.Join(ctx.MediaRoot, file))
	}
	return count, nil
}

func (server *Server) createPack(response http.ResponseWriter, request *http.Request) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	value, err := readBody(request)
	if err != nil {
		return err
	}
	ids := stringSlice(value["sourceItemIds"])
	if len(ids) == 0 {
		return errors.New("请至少选择一个素材")
	}
	marks, args := marks(ids)
	rows, err := ctx.DB.Query("SELECT source_items.id,source_items.title,assets.id,assets.cache_state FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id IN ("+marks+")", args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	warnings := []string{}
	count := 0
	for rows.Next() {
		var id, title string
		var assetID, state sql.NullString
		if err := rows.Scan(&id, &title, &assetID, &state); err != nil {
			return err
		}
		count++
		if assetID.Valid && state.String != "cached" {
			warnings = append(warnings, fmt.Sprintf("素材“%s”没有本地副本，打包时仅保留链接。", title))
		}
	}
	if count != len(ids) {
		return errors.New("部分素材不存在或已删除")
	}
	id := "source-pack-" + newID()
	createdAt := now()
	name := firstString(value["name"], "Sourcebook Pack")
	prompt := firstString(value["prompt"], "请使用附带的素材作为上下文完成任务。")
	tx, err := ctx.DB.Begin()
	if err != nil {
		return err
	}
	defer rollback(tx)
	if _, err = tx.Exec("INSERT INTO source_packs VALUES (?,?,?,?,?)", id, name, prompt, "", createdAt); err != nil {
		return err
	}
	for _, sourceItemID := range ids {
		if _, err = tx.Exec("INSERT INTO source_pack_items VALUES (?,?)", id, sourceItemID); err != nil {
			return err
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	writeJSON(response, http.StatusCreated, map[string]any{"sourcePack": map[string]any{"id": id, "name": name, "prompt": prompt, "sourceItemIds": ids, "createdAt": createdAt, "warnings": warnings}})
	return nil
}

func (server *Server) listPacks(response http.ResponseWriter, request *http.Request) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	rows, err := ctx.DB.Query("SELECT id,name,prompt,created_at FROM source_packs ORDER BY created_at DESC LIMIT 50")
	if err != nil {
		return err
	}
	defer rows.Close()
	packs := []map[string]any{}
	for rows.Next() {
		var id, name, prompt, createdAt string
		if err := rows.Scan(&id, &name, &prompt, &createdAt); err != nil {
			return err
		}
		packs = append(packs, map[string]any{"id": id, "name": name, "prompt": prompt, "createdAt": createdAt})
	}
	writeJSON(response, http.StatusOK, map[string]any{"packs": packs})
	return nil
}

func (server *Server) sourceAction(response http.ResponseWriter, request *http.Request, sourceItemID, action string) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	switch action {
	case "download", "retry-download":
		if err := startImageDownload(ctx, sourceItemID); err != nil {
			return err
		}
		writeJSON(response, http.StatusAccepted, map[string]any{"status": "downloading"})
		return nil
	case "validate-link":
		result, err := validateSourceLink(ctx, sourceItemID)
		if err != nil {
			return err
		}
		writeJSON(response, http.StatusOK, result)
		return nil
	case "reveal-local":
		result, err := revealLocalFile(ctx, sourceItemID)
		if err != nil {
			return err
		}
		writeJSON(response, http.StatusOK, result)
		return nil
	case "open-local":
		result, err := openLocalFile(ctx, sourceItemID)
		if err != nil {
			return err
		}
		writeJSON(response, http.StatusOK, result)
		return nil
	case "copy-text-file":
		result, err := copyTextSourceAsFile(ctx, sourceItemID)
		if err != nil {
			return err
		}
		writeJSON(response, http.StatusOK, result)
		return nil
	default:
		return &apiError{status: http.StatusNotFound, code: "NOT_FOUND", message: "Not found"}
	}
}

func (server *Server) serveMedia(response http.ResponseWriter, bookID, assetID string) error {
	ctx, err := server.context(bookID, false)
	if err != nil {
		return err
	}
	var mimeType, fileName string
	err = ctx.DB.QueryRow("SELECT mime_type,file_name FROM assets WHERE id=?", assetID).Scan(&mimeType, &fileName)
	if errors.Is(err, sql.ErrNoRows) {
		return &apiError{status: http.StatusNotFound, code: "MEDIA_UNAVAILABLE", message: "文件不可用"}
	}
	if err != nil {
		return err
	}
	data, err := os.ReadFile(filepath.Join(ctx.MediaRoot, fileName))
	if err != nil {
		return &apiError{status: http.StatusNotFound, code: "MEDIA_UNAVAILABLE", message: "文件不可用"}
	}
	response.Header().Set("content-type", mimeType)
	response.Header().Set("x-content-type-options", "nosniff")
	_, _ = response.Write(data)
	return nil
}

func (server *Server) previewSource(response http.ResponseWriter, bookID, sourceItemID string) error {
	ctx, err := server.context(bookID, true)
	if err != nil {
		return err
	}
	var modality, metadataJSON string
	var previewFileName, previewMimeType, sourceURL sql.NullString
	err = ctx.DB.QueryRow("SELECT picks.modality,picks.metadata_json,assets.preview_file_name,assets.preview_mime_type,sources.url FROM source_items JOIN picks ON picks.source_item_id=source_items.id JOIN sources ON sources.id=source_items.source_id LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&modality, &metadataJSON, &previewFileName, &previewMimeType, &sourceURL)
	if errors.Is(err, sql.ErrNoRows) || (modality != "video" && modality != "post") {
		return &apiError{status: http.StatusNotFound, code: "PREVIEW_UNAVAILABLE", message: "素材封面不可用"}
	}
	if err != nil {
		return err
	}
	if previewFileName.Valid && previewMimeType.Valid {
		data, err := os.ReadFile(filepath.Join(ctx.MediaRoot, filepath.Base(previewFileName.String)))
		if err == nil {
			response.Header().Set("content-type", previewMimeType.String)
			response.Header().Set("cache-control", "private, max-age=31536000, immutable")
			response.Header().Set("x-content-type-options", "nosniff")
			_, _ = response.Write(data)
			return nil
		}
	}
	metadata := map[string]any{}
	_ = json.Unmarshal([]byte(metadataJSON), &metadata)
	previews := previewCandidates(metadata, modality)
	if len(previews) == 0 {
		return &apiError{status: http.StatusNotFound, code: "PREVIEW_UNAVAILABLE", message: "素材封面不可用"}
	}
	var downloadErr error
	for _, preview := range previews {
		data, mimeType, _, err := downloadImageWithReferer(preview, sourceURL.String)
		if err != nil {
			downloadErr = err
			continue
		}
		response.Header().Set("content-type", mimeType)
		response.Header().Set("cache-control", "private, max-age=86400")
		response.Header().Set("x-content-type-options", "nosniff")
		_, _ = response.Write(data)
		return nil
	}
	return &apiError{status: http.StatusBadGateway, code: "PREVIEW_UNAVAILABLE", message: firstString(errorString(downloadErr), "素材封面不可用")}
}

func (server *Server) transferSource(response http.ResponseWriter, request *http.Request, fromBookID, sourceItemID string) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	targetBookID, mode := stringValue(value["targetBookId"]), stringValue(value["mode"])
	if targetBookID == "" || (mode != "copy" && mode != "move") {
		return errors.New("请选择目标 Book 和操作方式")
	}
	if targetBookID == fromBookID {
		return errors.New("素材已经在此 Book 中")
	}
	from, err := server.context(fromBookID, true)
	if err != nil {
		return err
	}
	target, err := server.context(targetBookID, true)
	if err != nil {
		return err
	}
	row, err := sourceForTransfer(from, sourceItemID)
	if err != nil {
		return err
	}
	var existingID string
	err = target.DB.QueryRow("SELECT id FROM resources WHERE content_hash=?", row.ContentHash).Scan(&existingID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err := ensureCapacity(target); err != nil {
		return err
	}
	suffix := newID()
	sourceID, targetItemID, pickID := "source-"+suffix, "source-item-"+suffix, "pick-"+suffix
	resourceID := existingID
	if resourceID == "" {
		resourceID = "resource-" + suffix
	}
	tx, err := target.DB.Begin()
	if err != nil {
		return err
	}
	defer rollback(tx)
	if _, err = tx.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", sourceID, row.SourceLabel, row.SourceURL, row.SourcePickedAt); err != nil {
		return err
	}
	if existingID == "" {
		if _, err = tx.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at,favorite) VALUES (?,?,?,?,?,?,?,?)", resourceID, row.Kind, sourceID, row.ResourceTitle, row.Summary, row.ContentHash, row.ResourceCreatedAt, row.Favorite); err != nil {
			return err
		}
		if row.ContentText.Valid && row.Modality != "image" && row.Modality != "video" {
			if _, err = tx.Exec("INSERT INTO text_contents (resource_id,text) VALUES (?,?)", resourceID, row.ContentText.String); err != nil {
				return err
			}
		}
		if row.MimeType.Valid {
			if err = copyTransferAsset(tx, from, target, row, resourceID, suffix); err != nil {
				return err
			}
		}
	} else {
		var oldNote sql.NullString
		// The target Book has one SQLite connection. Query through the active
		// transaction so a duplicate transfer never waits on its own transaction.
		_ = tx.QueryRow("SELECT note FROM source_items WHERE resource_id=? ORDER BY created_at DESC LIMIT 1", resourceID).Scan(&oldNote)
		if oldNote.Valid && row.Note != "" && !strings.Contains(oldNote.String, row.Note) {
			row.Note = oldNote.String + ", " + row.Note
		}
	}
	if _, err = tx.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", targetItemID, resourceID, sourceID, row.ItemTitle, row.Note, row.StorageState, row.ItemCreatedAt); err != nil {
		return err
	}
	if _, err = tx.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", pickID, resourceID, sourceID, targetItemID, row.Modality, row.PickType, row.MetadataJSON, row.PickPickedAt); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	if mode == "move" {
		if _, err := removeItems(from, []string{sourceItemID}); err != nil {
			return err
		}
	}
	writeJSON(response, http.StatusOK, map[string]any{"ok": true, "mode": mode, "sourceItemId": targetItemID, "targetBookId": targetBookID, "merged": existingID != ""})
	return nil
}

type transferRow struct {
	ResourceID        string
	Kind              string
	ResourceTitle     string
	Summary           string
	ContentHash       string
	Favorite          int
	ResourceCreatedAt string
	SourceLabel       string
	SourceURL         string
	SourcePickedAt    string
	ContentText       sql.NullString
	MimeType          sql.NullString
	OriginalURL       sql.NullString
	CacheState        sql.NullString
	LinkState         sql.NullString
	FileName          sql.NullString
	PreviewFileName   sql.NullString
	PreviewMimeType   sql.NullString
	Modality          string
	PickType          string
	MetadataJSON      string
	PickPickedAt      string
	ItemTitle         string
	Note              string
	StorageState      string
	ItemCreatedAt     string
}

func sourceForTransfer(ctx *BookContext, sourceItemID string) (transferRow, error) {
	row := transferRow{}
	err := ctx.DB.QueryRow(`SELECT source_items.resource_id,resources.kind,resources.title,resources.summary,resources.content_hash,resources.favorite,resources.created_at,sources.label,sources.url,sources.picked_at,text_contents.text,assets.mime_type,assets.original_url,assets.cache_state,assets.link_state,assets.file_name,assets.preview_file_name,assets.preview_mime_type,picks.modality,picks.pick_type,picks.metadata_json,picks.picked_at,source_items.title,source_items.note,source_items.storage_state,source_items.created_at FROM source_items JOIN resources ON resources.id=source_items.resource_id JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=resources.id LEFT JOIN assets ON assets.resource_id=resources.id JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id=?`, sourceItemID).Scan(
		&row.ResourceID, &row.Kind, &row.ResourceTitle, &row.Summary, &row.ContentHash, &row.Favorite, &row.ResourceCreatedAt, &row.SourceLabel, &row.SourceURL, &row.SourcePickedAt, &row.ContentText, &row.MimeType, &row.OriginalURL, &row.CacheState, &row.LinkState, &row.FileName, &row.PreviewFileName, &row.PreviewMimeType, &row.Modality, &row.PickType, &row.MetadataJSON, &row.PickPickedAt, &row.ItemTitle, &row.Note, &row.StorageState, &row.ItemCreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return row, errors.New("素材不存在")
	}
	return row, err
}

func copyTransferAsset(tx *sql.Tx, from, target *BookContext, row transferRow, resourceID, suffix string) error {
	assetID := "asset-" + suffix
	fileName, fileURI := "", nullableOr(row.OriginalURL, "")
	state := nullableOr(row.CacheState, "missing")
	if row.FileName.Valid {
		sourcePath := filepath.Join(from.MediaRoot, row.FileName.String)
		if _, err := os.Stat(sourcePath); err == nil {
			fileName = safeName(row.ResourceTitle, filepath.Ext(row.FileName.String), assetID)
			if err := copyFile(sourcePath, filepath.Join(target.MediaRoot, fileName)); err != nil {
				return err
			}
			fileURI = "/api/books/" + target.Book.ID + "/media/" + assetID
			state = "cached"
		} else if state == "cached" {
			state = "missing"
		}
	}
	previewFileName := ""
	if row.PreviewFileName.Valid {
		sourcePath := filepath.Join(from.MediaRoot, row.PreviewFileName.String)
		if _, err := os.Stat(sourcePath); err == nil {
			previewFileName = safeName(row.ResourceTitle+"-cover", filepath.Ext(row.PreviewFileName.String), "preview-"+assetID)
			if err := copyFile(sourcePath, filepath.Join(target.MediaRoot, previewFileName)); err != nil {
				return err
			}
		}
	}
	_, err := tx.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state,preview_file_name,preview_mime_type) VALUES (?,?,?,?,?,?,?,?,?,?)", assetID, resourceID, row.MimeType.String, nullableString(row.OriginalURL), fileURI, state, nullableFileName(fileName), nullableOr(row.LinkState, "none"), nullableFileName(previewFileName), nullableString(row.PreviewMimeType))
	return err
}

func nullableFileName(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (server *Server) copyPackMaterials(response http.ResponseWriter, request *http.Request) error {
	ctx, err := server.context(request.URL.Query().Get("bookId"), false)
	if err != nil {
		return err
	}
	value, err := readBody(request)
	if err != nil {
		return err
	}
	result, err := copyPackMaterials(ctx, stringSlice(value["sourceItemIds"]))
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, result)
	return nil
}

func startImageDownload(ctx *BookContext, sourceItemID string) error {
	var resourceID, modality, originalURL, state string
	err := ctx.DB.QueryRow("SELECT source_items.resource_id,picks.modality,assets.original_url,assets.cache_state FROM source_items JOIN picks ON picks.source_item_id=source_items.id LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&resourceID, &modality, &originalURL, &state)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("素材不存在")
	}
	if err != nil {
		return err
	}
	if modality != "image" || originalURL == "" {
		return errors.New("此素材没有可重新下载的图片链接")
	}
	if state == "downloading" {
		return nil
	}
	if _, err := ctx.DB.Exec("UPDATE assets SET cache_state='downloading',file_uri=? WHERE resource_id=?", originalURL, resourceID); err != nil {
		return err
	}
	_, _ = ctx.DB.Exec("UPDATE source_items SET storage_state='downloading' WHERE resource_id=?", resourceID)
	go cacheImage(ctx, resourceID)
	return nil
}

func cacheImage(ctx *BookContext, resourceID string) {
	var assetID, originalURL, title string
	if err := ctx.DB.QueryRow("SELECT assets.id,assets.original_url,resources.title FROM assets JOIN resources ON resources.id=assets.resource_id WHERE assets.resource_id=?", resourceID).Scan(&assetID, &originalURL, &title); err != nil {
		return
	}
	bytes, mimeType, extension, err := downloadImage(originalURL)
	if err != nil {
		_, _ = ctx.DB.Exec("UPDATE assets SET cache_state='failed',file_uri=?,link_state=? WHERE id=?", originalURL, linkStateAfterDownloadError(err), assetID)
		_, _ = ctx.DB.Exec("UPDATE source_items SET storage_state='failed' WHERE resource_id=?", resourceID)
		return
	}
	fileName := safeName(title, extension, assetID)
	if err := os.WriteFile(filepath.Join(ctx.MediaRoot, fileName), bytes, 0o644); err != nil {
		return
	}
	_, _ = ctx.DB.Exec("UPDATE assets SET mime_type=?,file_uri=?,cache_state='cached',file_name=? WHERE id=?", mimeType, "/api/books/"+ctx.Book.ID+"/media/"+assetID, fileName, assetID)
	_, _ = ctx.DB.Exec("UPDATE source_items SET storage_state='available' WHERE resource_id=?", resourceID)
}

func validateSourceLink(ctx *BookContext, sourceItemID string) (map[string]any, error) {
	var assetID, originalURL string
	err := ctx.DB.QueryRow("SELECT assets.id,assets.original_url FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&assetID, &originalURL)
	if errors.Is(err, sql.ErrNoRows) || originalURL == "" {
		return nil, errors.New("此素材没有可检查的来源链接")
	}
	if err != nil {
		return nil, err
	}
	result := checkImageLink(originalURL)
	if state := stringValue(result["state"]); state == "invalid" || state == "linked" {
		_, _ = ctx.DB.Exec("UPDATE assets SET link_state=? WHERE id=?", state, assetID)
	}
	return result, nil
}

func allowedHost(value string) bool {
	host, port, err := net.SplitHostPort(value)
	if err != nil || (host != "127.0.0.1" && host != "localhost") {
		return false
	}
	parsedPort, err := strconv.Atoi(port)
	return err == nil && parsedPort > 0 && parsedPort <= 65535
}

func allowedOrigin(value, host string) bool {
	if value == "" {
		return true
	}
	if value == "http://"+host {
		return true
	}
	return value == "chrome-extension://"+LocalPickerExtensionID ||
		value == "chrome-extension://"+ChromeWebStorePickerExtensionID
}

func validModality(value string) bool {
	for _, modality := range []string{"text", "image", "video", "audio", "file", "link", "post", "conversation"} {
		if value == modality {
			return true
		}
	}
	return false
}

func titleFor(value map[string]any, modality string) string {
	if title := cleanTitle(stringValue(value["title"]), 160); title != "" {
		return title
	}
	if modality == "conversation" {
		if conversation, ok := objectValue(value["conversation"]); ok {
			return firstString(conversation["provider"], "Agent") + " conversation"
		}
		return "Agent conversation"
	}
	if modality == "link" {
		if metadata, ok := objectValue(value["pageMetadata"]); ok {
			return cleanTitle(firstString(metadata["pageTitle"], value["sourceTitle"], host(stringValue(value["sourceUrl"]))), 160)
		}
	}
	if modality == "post" {
		if post, ok := objectValue(value["post"]); ok {
			if title := cleanTitle(stringValue(post["title"]), 160); title != "" {
				return title
			}
			// X posts commonly have no separate title. A stable label is clearer
			// than duplicating the full body in the card header.
			if strings.EqualFold(host(stringValue(value["sourceUrl"])), "x.com") || strings.EqualFold(host(stringValue(value["sourceUrl"])), "twitter.com") {
				return "Post from X"
			}
			return "Post from " + host(stringValue(value["sourceUrl"]))
		}
	}
	if modality == "image" && strings.TrimSpace(stringValue(value["contentText"])) != "" {
		return truncate(strings.TrimSpace(stringValue(value["contentText"])), 15)
	}
	return cleanTitle(firstString(value["contentText"], value["sourceTitle"], value["contentUrl"], "Untitled Pick"), 80)
}

func summaryFor(value map[string]any, modality string) string {
	if metadata, ok := objectValue(value["pageMetadata"]); ok {
		if description := stringValue(metadata["description"]); description != "" {
			return cleanTitle(description, 240)
		}
	}
	if modality == "link" {
		return ""
	}
	return cleanTitle(firstString(value["contentText"], value["contentUrl"]), 240)
}

func mergeMetadata(value map[string]any, modality string) map[string]any {
	metadata := map[string]any{}
	if existing, ok := objectValue(value["metadata"]); ok {
		for key, nested := range existing {
			metadata[key] = nested
		}
	}
	if page, ok := objectValue(value["pageMetadata"]); ok {
		for key, nested := range page {
			metadata[key] = nested
		}
	}
	if value["faviconUrl"] != nil {
		metadata["faviconUrl"] = value["faviconUrl"]
	}
	if value["conversation"] != nil {
		metadata["conversation"] = value["conversation"]
	}
	if post, ok := objectValue(value["post"]); ok {
		metadata["post"] = compactPost(post)
	}
	if candidates := externalURLs(value["thumbnailCandidates"]); len(candidates) > 0 {
		metadata["thumbnailCandidates"] = candidates
	}
	if modality == "video" {
		if preview := externalURL(value["thumbnailUrl"]); preview != "" {
			metadata["mediaPreviewUrl"] = preview
		} else if preview := externalURL(metadata["ogImage"]); preview != "" {
			metadata["mediaPreviewUrl"] = preview
		}
	}
	if modality == "post" {
		if preview := externalURL(value["thumbnailUrl"]); preview != "" {
			metadata["mediaPreviewUrl"] = preview
		} else if preview := externalURL(metadata["ogImage"]); preview != "" {
			metadata["mediaPreviewUrl"] = preview
		}
	}
	return metadata
}

// Keep the Picker's full ordered cover chain. The first URL is normally used,
// but CDN variants (notably YouTube maxres and Xiaohongshu first frames) can
// expire or return 404 independently, so the local preview route retries each
// candidate before declaring a cover unavailable.
func previewCandidates(metadata map[string]any, modality string) []string {
	values := []any{metadata["mediaPreviewUrl"], metadata["videoPreviewUrl"], metadata["ogImage"]}
	values = append(values, valuesFrom(metadata["thumbnailCandidates"])...)
	if modality == "post" {
		values = append(values, postThumbnail(metadata))
	}
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		preview := externalURL(value)
		if preview == "" {
			continue
		}
		if strings.HasPrefix(preview, "http://") {
			preview = "https://" + strings.TrimPrefix(preview, "http://")
		}
		if !seen[preview] {
			seen[preview] = true
			result = append(result, preview)
		}
	}
	return result
}

func externalURLs(value any) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, candidate := range valuesFrom(value) {
		url := externalURL(candidate)
		if url != "" && !seen[url] {
			seen[url] = true
			result = append(result, url)
		}
	}
	return result
}

func valuesFrom(value any) []any {
	switch values := value.(type) {
	case []any:
		return values
	case []string:
		result := make([]any, len(values))
		for index, value := range values {
			result[index] = value
		}
		return result
	default:
		return nil
	}
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func kindFor(modality string) string {
	if modality == "conversation" {
		return "agent-output"
	}
	if modality == "link" {
		return "webpage"
	}
	if modality == "post" {
		return "post"
	}
	return modality
}

func postThumbnail(metadata map[string]any) any {
	if preview := externalURL(metadata["mediaPreviewUrl"]); preview != "" {
		return preview
	}
	post, ok := objectValue(metadata["post"])
	if !ok {
		return nil
	}
	media, ok := post["media"].([]any)
	if !ok {
		return nil
	}
	for _, entry := range media {
		item, ok := objectValue(entry)
		if !ok {
			continue
		}
		if preview := externalURL(firstString(item["thumbnailUrl"], item["sourceUrl"])); preview != "" {
			return preview
		}
	}
	return nil
}

// Post capture is intentionally compact. Picker-side platform and media details
// select the best cover while the page is open, but are not durable user data.
func compactPost(post map[string]any) map[string]any {
	compact := map[string]any{"schemaVersion": 1, "bodyText": strings.TrimSpace(stringValue(post["bodyText"]))}
	if title := strings.TrimSpace(stringValue(post["title"])); title != "" {
		compact["title"] = title
	}
	if publishedAt := strings.TrimSpace(stringValue(post["publishedAt"])); publishedAt != "" {
		compact["publishedAt"] = publishedAt
	}
	if author, ok := objectValue(post["author"]); ok {
		compactAuthor := map[string]any{}
		if displayName := strings.TrimSpace(stringValue(author["displayName"])); displayName != "" {
			compactAuthor["displayName"] = displayName
		}
		if handle := strings.TrimSpace(stringValue(author["handle"])); handle != "" {
			compactAuthor["handle"] = handle
		}
		if len(compactAuthor) > 0 {
			compact["author"] = compactAuthor
		}
	}
	if tags := stringSlice(post["tags"]); len(tags) > 0 {
		compact["tags"] = tags
	}
	return compact
}

func cleanTitle(value string, limit int) string {
	return truncate(strings.Join(strings.Fields(value), " "), limit)
}
func host(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Hostname() == "" {
		return "Browser"
	}
	return strings.TrimPrefix(parsed.Hostname(), "www.")
}
func originOf(value string) string {
	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}
func safeName(value, extension, id string) string {
	name := strings.Map(func(character rune) rune {
		if strings.ContainsRune(`\\/:*?"<>|`, character) {
			return ' '
		}
		return character
	}, value)
	name = truncate(strings.Join(strings.Fields(name), " "), 64)
	if name == "" {
		name = "image"
	}
	if extension == "" {
		extension = ".bin"
	}
	if !strings.HasPrefix(extension, ".") {
		extension = "." + extension
	}
	return name + "-" + lastID(id) + extension
}
func lastID(value string) string {
	if len(value) <= 6 {
		return value
	}
	return value[len(value)-6:]
}
func hashString(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func newID() string {
	bytes := make([]byte, 8)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
func firstString(values ...any) string {
	for _, value := range values {
		if stringValue(value) != "" {
			return stringValue(value)
		}
	}
	return ""
}
func stringValue(value any) string { stringValue, _ := value.(string); return stringValue }
func boolValue(value any) bool     { boolean, _ := value.(bool); return boolean }
func objectValue(value any) (map[string]any, bool) {
	object, ok := value.(map[string]any)
	return object, ok
}
func stringSlice(value any) []string {
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	seen, result := map[string]bool{}, []string{}
	for _, nested := range raw {
		if current := stringValue(nested); current != "" && !seen[current] {
			seen[current] = true
			result = append(result, current)
		}
	}
	return result
}
func nullableString(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}
func nullableAny(value any) any {
	if value == nil {
		return nil
	}
	return value
}
func nullableOr(value sql.NullString, fallback string) string {
	if value.Valid && value.String != "" {
		return value.String
	}
	return fallback
}
func externalURL(value any) string {
	current := stringValue(value)
	if strings.HasPrefix(current, "http://") || strings.HasPrefix(current, "https://") {
		return current
	}
	return ""
}
func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}
func rollback(transaction *sql.Tx) { _ = transaction.Rollback() }
func marks(ids []string) (string, []any) {
	placeholders, values := make([]string, len(ids)), make([]any, len(ids))
	for index, id := range ids {
		placeholders[index], values[index] = "?", id
	}
	return strings.Join(placeholders, ","), values
}
func moveToTrash(path string) {
	if _, err := os.Stat(path); err != nil {
		return
	}
	trash := filepath.Join(filepath.Dir(path), ".trash")
	_ = os.MkdirAll(trash, 0o755)
	_ = os.Rename(path, filepath.Join(trash, fmt.Sprintf("%d-%s", time.Now().UnixMilli(), filepath.Base(path))))
}

func ensureCapacity(ctx *BookContext) error {
	var count int
	if err := ctx.DB.QueryRow("SELECT COUNT(*) FROM source_items").Scan(&count); err != nil {
		return err
	}
	if count >= bookSourceLimit {
		return &apiError{status: http.StatusConflict, code: "BOOK_SOURCE_LIMIT_REACHED", message: "This Book can contain up to 200 sources."}
	}
	return nil
}

func encodeCursor(createdAt, id string) string {
	data, _ := json.Marshal(map[string]string{"createdAt": createdAt, "id": id})
	return base64.RawURLEncoding.EncodeToString(data)
}
func decodeCursor(value string) (string, string, error) {
	if value == "" {
		return "", "", nil
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", "", &apiError{status: 400, code: "INVALID_SOURCE_CURSOR", message: "Invalid source page cursor."}
	}
	var cursor map[string]string
	if err := json.Unmarshal(data, &cursor); err != nil || cursor["createdAt"] == "" || cursor["id"] == "" {
		return "", "", &apiError{status: 400, code: "INVALID_SOURCE_CURSOR", message: "Invalid source page cursor."}
	}
	return cursor["createdAt"], cursor["id"], nil
}

func readBody(request *http.Request) (map[string]any, error) {
	defer request.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(request.Body, 30*1024*1024))
	decoder.UseNumber()
	value := map[string]any{}
	if err := decoder.Decode(&value); err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return value, nil
}
func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("content-type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}
func localImportFormat(name string) (string, string, bool) {
	formats := map[string][2]string{".jpg": {"image/jpeg", "image"}, ".jpeg": {"image/jpeg", "image"}, ".png": {"image/png", "image"}, ".webp": {"image/webp", "image"}, ".gif": {"image/gif", "image"}, ".mp3": {"audio/mpeg", "audio"}, ".wav": {"audio/wav", "audio"}, ".m4a": {"audio/mp4", "audio"}, ".aac": {"audio/aac", "audio"}, ".flac": {"audio/flac", "audio"}, ".ogg": {"audio/ogg", "audio"}, ".mp4": {"video/mp4", "video"}, ".mov": {"video/quicktime", "video"}, ".webm": {"video/webm", "video"}, ".pdf": {"application/pdf", "file"}, ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "file"}, ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation", "file"}, ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file"}, ".csv": {"text/csv", "file"}, ".txt": {"text/plain", "file"}, ".md": {"text/markdown", "file"}, ".rtf": {"application/rtf", "file"}, ".json": {"application/json", "file"}, ".html": {"text/html", "file"}, ".htm": {"text/html", "file"}}
	format, ok := formats[strings.ToLower(filepath.Ext(name))]
	return format[0], format[1], ok
}
func imageType(bytes []byte) (string, string, error) {
	if len(bytes) >= 8 && string(bytes[:8]) == "\x89PNG\r\n\x1a\n" {
		return "image/png", ".png", nil
	}
	if len(bytes) >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 {
		return "image/jpeg", ".jpg", nil
	}
	if len(bytes) >= 6 && (string(bytes[:6]) == "GIF87a" || string(bytes[:6]) == "GIF89a") {
		return "image/gif", ".gif", nil
	}
	if len(bytes) >= 12 && string(bytes[:4]) == "RIFF" && string(bytes[8:12]) == "WEBP" {
		return "image/webp", ".webp", nil
	}
	return "", "", errors.New("仅支持 PNG、JPEG、GIF、WebP 图片")
}
func serveWebsite(response http.ResponseWriter, request *http.Request, root string) error {
	root, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	relative := strings.TrimPrefix(filepath.Clean("/"+request.URL.Path), "/")
	candidate := filepath.Join(root, relative)
	if request.URL.Path == "/" || !strings.HasPrefix(candidate, root) {
		candidate = filepath.Join(root, "index.html")
	}
	if _, err := os.Stat(candidate); err != nil {
		candidate = filepath.Join(root, "index.html")
	}
	if _, err := os.Stat(candidate); err != nil {
		return &apiError{status: 503, code: "BUILD_MISSING", message: "Sourcebook Sources build is missing"}
	}
	response.Header().Set("content-type", mime.TypeByExtension(filepath.Ext(candidate)))
	http.ServeFile(response, request, candidate)
	return nil
}
