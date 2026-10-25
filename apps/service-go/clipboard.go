package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const clipboardFileLimit = 20

type clipboardImportRequest struct {
	Token string                `json:"token"`
	Items []clipboardImportItem `json:"items"`
}

type clipboardImportItem struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	NativeFileID string `json:"nativeFileId,omitempty"`
	Value        string `json:"value,omitempty"`
}

type clipboardImportResult struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

// clipboardFiles records exactly the files currently placed on the system
// clipboard. The browser receives a short-lived token and display metadata,
// never local paths. That token is required to import later.
func (server *Server) clipboardFiles(response http.ResponseWriter) error {
	paths, err := clipboardFilePaths()
	if err != nil {
		return err
	}
	filesForSnapshot, files := clipboardSnapshotEntries(paths)
	token := newID()
	server.clipboardMu.Lock()
	for key, snapshot := range server.clipboardSnapshots {
		if time.Since(snapshot.createdAt) > 5*time.Minute {
			delete(server.clipboardSnapshots, key)
		}
	}
	server.clipboardSnapshots[token] = clipboardSnapshot{files: filesForSnapshot, createdAt: time.Now()}
	server.clipboardMu.Unlock()
	writeJSON(response, http.StatusOK, map[string]any{"token": token, "files": files})
	return nil
}

// clipboardSnapshotEntries separates ordinary copied files from other native
// clipboard entries. Folders must be shown back to the user as unsupported,
// instead of making every neighboring file appear to fail.
func clipboardSnapshotEntries(paths []string) ([]clipboardSnapshotFile, []map[string]any) {
	filesForSnapshot := make([]clipboardSnapshotFile, 0, len(paths))
	files := make([]map[string]any, 0, len(paths))
	for _, path := range paths {
		fileID := "clipboard-file-" + newID()
		name := filepath.Base(path)
		info, statErr := os.Stat(path)
		if statErr != nil {
			files = append(files, map[string]any{"id": fileID, "name": name, "modality": "file", "unsupportedReason": "unreadable"})
			continue
		}
		if info.IsDir() {
			files = append(files, map[string]any{"id": fileID, "name": name, "size": info.Size(), "modality": "file", "unsupportedReason": "folder", "modifiedAt": info.ModTime().UTC().Format(time.RFC3339Nano)})
			continue
		}
		if !info.Mode().IsRegular() {
			files = append(files, map[string]any{"id": fileID, "name": name, "size": info.Size(), "modality": "file", "unsupportedReason": "unsupported", "modifiedAt": info.ModTime().UTC().Format(time.RFC3339Nano)})
			continue
		}
		filesForSnapshot = append(filesForSnapshot, clipboardSnapshotFile{id: fileID, path: path})
		mimeType, modality := clipboardFileType(name)
		files = append(files, map[string]any{"id": fileID, "name": name, "size": info.Size(), "mimeType": mimeType, "modality": modality, "modifiedAt": info.ModTime().UTC().Format(time.RFC3339Nano)})
	}
	return filesForSnapshot, files
}

func (server *Server) takeClipboardSnapshot(token string) ([]clipboardSnapshotFile, error) {
	server.clipboardMu.Lock()
	defer server.clipboardMu.Unlock()
	snapshot, ok := server.clipboardSnapshots[token]
	delete(server.clipboardSnapshots, token)
	if !ok || time.Since(snapshot.createdAt) > 5*time.Minute {
		return nil, &apiError{status: http.StatusGone, code: "CLIPBOARD_SNAPSHOT_EXPIRED", message: "剪贴板内容已过期。请重新粘贴后再试。"}
	}
	return snapshot.files, nil
}

func (server *Server) importClipboard(response http.ResponseWriter, request *http.Request, bookID string) error {
	ctx, err := server.context(bookID, true)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(request.Header.Get("content-type"), "multipart/form-data") {
		return &apiError{status: http.StatusUnsupportedMediaType, code: "CLIPBOARD_MULTIPART_REQUIRED", message: "当前环境无法流式传输粘贴的文件。请重新粘贴后再试。"}
	}
	return server.importClipboardMultipart(response, request, ctx)
}

// importClipboardMultipart streams browser-provided files directly into the
// Book. It deliberately avoids base64 and JSON request bodies, so neither a
// single large file nor several ordinary files are constrained by an arbitrary
// browser-memory or request-size ceiling.
func (server *Server) importClipboardMultipart(response http.ResponseWriter, request *http.Request, ctx *BookContext) error {
	reader, err := request.MultipartReader()
	if err != nil {
		return &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_MULTIPART", message: "粘贴内容无法读取。请重新复制后再试。"}
	}
	part, err := reader.NextPart()
	if err != nil {
		return &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_IMPORT_METADATA_REQUIRED", message: "粘贴内容缺少导入信息。请重新粘贴后再试。"}
	}
	defer part.Close()
	if part.FormName() != "payload" {
		return &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_IMPORT_METADATA_REQUIRED", message: "粘贴内容缺少导入信息。请重新粘贴后再试。"}
	}
	payloadBytes, err := io.ReadAll(io.LimitReader(part, 256*1024))
	if err != nil {
		return &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_PAYLOAD", message: "粘贴内容无法读取。请重新粘贴后再试。"}
	}
	var payload clipboardImportRequest
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_PAYLOAD", message: "粘贴内容无法读取。请重新粘贴后再试。"}
	}
	if len(payload.Items) == 0 {
		return &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_EMPTY", message: "剪贴板中没有可导入的内容。"}
	}

	items := map[string]clipboardImportItem{}
	fileCount := 0
	for _, item := range payload.Items {
		if item.ID == "" || items[item.ID].ID != "" {
			return &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_ITEM", message: "粘贴项目无效。请重新粘贴后再试。"}
		}
		switch item.Kind {
		case "native-file", "browser-file", "link", "text":
		default:
			return &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_ITEM", message: "粘贴项目无效。请重新粘贴后再试。"}
		}
		if item.Kind == "native-file" || item.Kind == "browser-file" {
			fileCount++
		}
		items[item.ID] = item
	}
	if fileCount > clipboardFileLimit {
		return &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_FILE_LIMIT", message: "一次最多粘贴 20 个文件。"}
	}

	results := make([]clipboardImportResult, 0, len(items))
	resultByID := map[string]clipboardImportResult{}
	addResult := func(id string, err error) {
		if err == nil {
			resultByID[id] = clipboardImportResult{ID: id, Status: "imported"}
			return
		}
		resultByID[id] = clipboardImportResult{ID: id, Status: "failed", Reason: clipboardImportReason(err)}
	}

	if payload.Token != "" {
		nativeFiles, snapshotErr := server.takeClipboardSnapshot(payload.Token)
		if snapshotErr != nil {
			for _, item := range items {
				if item.Kind == "native-file" {
					addResult(item.ID, snapshotErr)
				}
			}
		} else {
			nativeByID := map[string]clipboardSnapshotFile{}
			for _, file := range nativeFiles {
				nativeByID[file.id] = file
			}
			for _, item := range items {
				if item.Kind != "native-file" {
					continue
				}
				file, ok := nativeByID[item.NativeFileID]
				if !ok {
					addResult(item.ID, &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_FILE_UNAVAILABLE", message: "这个本地文件已不在剪贴板中。请重新复制后再试。"})
					continue
				}
				_, importErr := importClipboardPath(ctx, file.path)
				addResult(item.ID, importErr)
			}
		}
	}

	multipartInterrupted := false
	for {
		part, err = reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			multipartInterrupted = true
			break
		}
		func() {
			defer part.Close()
			id := strings.TrimPrefix(part.FormName(), "file-")
			item, ok := items[id]
			if !ok || item.Kind != "browser-file" || part.FileName() == "" {
				return
			}
			_, importErr := importClipboardReader(ctx, part.FileName(), part)
			addResult(id, importErr)
		}()
	}
	if multipartInterrupted {
		for _, item := range payload.Items {
			if item.Kind == "browser-file" && resultByID[item.ID].ID == "" {
				addResult(item.ID, &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_UPLOAD_INTERRUPTED", message: "这个文件无法传输，已跳过。请重新复制该文件后再试。"})
			}
		}
	}

	for _, item := range payload.Items {
		if item.Kind != "link" && item.Kind != "text" {
			continue
		}
		if item.Kind == "link" {
			parsed, parseErr := url.Parse(item.Value)
			if parseErr != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
				addResult(item.ID, &apiError{status: http.StatusBadRequest, code: "INVALID_CLIPBOARD_LINK", message: "这个链接无效。"})
			} else {
				_, saveErr := savePick(ctx, map[string]any{"modality": "link", "pickType": "clipboard", "sourceUrl": item.Value, "contentUrl": item.Value, "sourceTitle": host(item.Value), "pageMetadata": map[string]any{"canonicalUrl": item.Value}})
				addResult(item.ID, saveErr)
			}
		} else {
			text := strings.TrimSpace(item.Value)
			if text == "" {
				addResult(item.ID, &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_TEXT_EMPTY", message: "这段文本为空。"})
			} else {
				_, saveErr := savePick(ctx, map[string]any{"modality": "text", "pickType": "clipboard", "sourceUrl": "sourcebook://clipboard/text/" + newID(), "sourceTitle": "Clipboard", "contentText": text})
				addResult(item.ID, saveErr)
			}
		}
	}

	imported := 0
	for _, item := range payload.Items {
		result, ok := resultByID[item.ID]
		if !ok {
			result = clipboardImportResult{ID: item.ID, Status: "failed", Reason: "文件没有完成传输。请重新粘贴后再试。"}
		}
		if result.Status == "imported" {
			imported++
		}
		results = append(results, result)
	}
	if imported > 0 {
		server.publishSourceChange(ctx.Book.ID)
	}
	writeJSON(response, http.StatusCreated, map[string]any{"results": results})
	return nil
}

func clipboardImportReason(err error) string {
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		return apiErr.message
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		return "文件传输中断。请重新粘贴后再试。"
	}
	return "无法导入此项。请重新粘贴后再试。"
}

func importClipboardPath(ctx *BookContext, path string) (map[string]any, error) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_FILE_CHANGED", message: "文件已经移动、删除或不再可读。请重新复制后再试。"}
	}
	input, err := os.Open(path)
	if err != nil {
		return nil, &apiError{status: http.StatusBadRequest, code: "CLIPBOARD_FILE_UNREADABLE", message: "无法读取这个本地文件。"}
	}
	defer input.Close()
	return importClipboardReader(ctx, filepath.Base(path), input)
}

// importClipboardReader supports arbitrary file extensions and streams directly
// to the Book's media folder. No full file is held in browser or Go memory.
func importClipboardReader(ctx *BookContext, name string, input io.Reader) (map[string]any, error) {
	if err := ensureCapacity(ctx); err != nil {
		return nil, err
	}
	temp, err := os.CreateTemp(ctx.MediaRoot, ".clipboard-")
	if err != nil {
		return nil, err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	finalPath := ""
	committed := false
	defer func() {
		if !committed && finalPath != "" {
			_ = os.Remove(finalPath)
		}
	}()
	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(temp, hasher), input); err != nil {
		_ = temp.Close()
		return nil, err
	}
	if err := temp.Close(); err != nil {
		return nil, err
	}
	hash := hex.EncodeToString(hasher.Sum(nil))
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
	extension := filepath.Ext(name)
	mimeType, modality := clipboardFileType(name)
	title := firstString(strings.TrimSuffix(name, extension), name)
	pickedAt := now()
	tx, err := ctx.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer rollback(tx)
	if _, err = tx.Exec("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)", sourceID, "Clipboard file", "sourcebook://clipboard/"+url.PathEscape(name), pickedAt); err != nil {
		return nil, err
	}
	if existingID == "" {
		if _, err = tx.Exec("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)", resourceID, "file", sourceID, title, "", hash, pickedAt); err != nil {
			return nil, err
		}
		assetID := "asset-" + suffix
		fileName := safeName(title, extension, assetID)
		finalPath = filepath.Join(ctx.MediaRoot, fileName)
		if err = os.Rename(tempPath, finalPath); err != nil {
			return nil, err
		}
		if _, err = tx.Exec("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)", assetID, resourceID, mimeType, nil, "/api/books/"+ctx.Book.ID+"/media/"+assetID, "cached", fileName, "none"); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)", sourceItemID, resourceID, sourceID, title, "", "available", pickedAt); err != nil {
		return nil, err
	}
	if _, err = tx.Exec("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)", pickID, resourceID, sourceID, sourceItemID, modality, "clipboard", "{}", pickedAt); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	committed = true
	return map[string]any{"sourceItemId": sourceItemID, "resourceId": resourceID, "pickId": pickID, "status": map[bool]string{true: "duplicate", false: "saved"}[existingID != ""]}, nil
}

func clipboardFileType(name string) (string, string) {
	mimeType := mime.TypeByExtension(filepath.Ext(name))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if strings.HasPrefix(mimeType, "image/") {
		return mimeType, "image"
	}
	if strings.HasPrefix(mimeType, "audio/") {
		return mimeType, "audio"
	}
	if strings.HasPrefix(mimeType, "video/") {
		return mimeType, "video"
	}
	return mimeType, "file"
}
