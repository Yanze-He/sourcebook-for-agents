package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func revealLocalFile(ctx *BookContext, sourceItemID string) (map[string]any, error) {
	path, name, err := localFilePath(ctx, sourceItemID)
	if err != nil {
		return nil, err
	}
	command := revealLocalFileCommand(runtime.GOOS, path)
	if err := command.Start(); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "localPath": "assets/" + name}, nil
}

func revealLocalFileCommand(goos, filePath string) *exec.Cmd {
	switch goos {
	case "darwin":
		return exec.Command("open", "-R", filePath)
	case "windows":
		// Explorer's legacy /select, syntax can misparse paths with spaces or
		// non-ASCII characters and fall back to Documents. Opening the parent
		// folder directly is reliable and still fulfils “show in folder”.
		return exec.Command("explorer.exe", windowsParentFolder(filePath))
	default:
		return exec.Command("xdg-open", filepath.Dir(filePath))
	}
}

func windowsParentFolder(filePath string) string {
	separator := strings.LastIndexAny(filePath, `\/`)
	if separator < 0 {
		return filePath
	}
	// Preserve a drive root such as C:\ rather than returning C:.
	if separator == 2 && len(filePath) > 2 && filePath[1] == ':' {
		return filePath[:3]
	}
	if separator == 0 {
		return filePath[:1]
	}
	return filePath[:separator]
}

func openLocalFile(ctx *BookContext, sourceItemID string) (map[string]any, error) {
	path, name, err := localFilePath(ctx, sourceItemID)
	if err != nil {
		return nil, err
	}
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", path)
	case "windows":
		command = exec.Command("cmd.exe", "/c", "start", "", path)
	default:
		command = exec.Command("xdg-open", path)
	}
	if err := command.Start(); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "localPath": "assets/" + name}, nil
}

func localFilePath(ctx *BookContext, sourceItemID string) (string, string, error) {
	var fileName sql.NullString
	err := ctx.DB.QueryRow("SELECT assets.file_name FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&fileName)
	if errors.Is(err, sql.ErrNoRows) || !fileName.Valid {
		return "", "", errors.New("此素材没有本地文件")
	}
	if err != nil {
		return "", "", err
	}
	path := filepath.Join(ctx.MediaRoot, fileName.String)
	if _, err := os.Stat(path); err != nil {
		return "", "", errors.New("本地文件不存在")
	}
	return path, fileName.String, nil
}

func copyTextSourceAsFile(ctx *BookContext, sourceItemID string) (map[string]any, error) {
	var title, contentText, modality string
	err := ctx.DB.QueryRow("SELECT source_items.title,text_contents.text,picks.modality FROM source_items JOIN picks ON picks.source_item_id=source_items.id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id WHERE source_items.id=?", sourceItemID).Scan(&title, &contentText, &modality)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("素材不存在")
	}
	if err != nil {
		return nil, err
	}
	if modality != "text" && modality != "conversation" {
		return nil, &apiError{status: 400, code: "TEXT_FILE_ONLY", message: "只有 Text 和 Chat 可以复制为文本文件。"}
	}
	root := filepath.Join(os.TempDir(), "sourcebook-clipboard")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	fileName := safeName(title, ".txt", sourceItemID)
	path := filepath.Join(root, fileName)
	if err := os.WriteFile(path, []byte(contentText), 0o644); err != nil {
		return nil, err
	}
	if err := copyFilesToSystemClipboard([]string{path}); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "fileName": fileName}, nil
}

func copyPackMaterials(ctx *BookContext, ids []string) (map[string]any, error) {
	if len(ids) == 0 {
		return nil, &apiError{status: 400, code: "EMPTY_PACK", message: "请至少选择一个素材"}
	}
	marks, values := marks(ids)
	rows, err := ctx.DB.Query("SELECT source_items.id,source_items.title,source_items.note,sources.url,text_contents.text,assets.file_name,assets.cache_state,picks.modality FROM source_items JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id LEFT JOIN assets ON assets.resource_id=source_items.resource_id LEFT JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id IN ("+marks+")", values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	root := filepath.Join(os.TempDir(), "sourcebook-clipboard", "packs")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	filePaths := []string{}
	skipped, links, count := 0, 0, 0
	for rows.Next() {
		var id, title, note, sourceURL, modality string
		var contentText, fileName, cacheState sql.NullString
		if err := rows.Scan(&id, &title, &note, &sourceURL, &contentText, &fileName, &cacheState, &modality); err != nil {
			return nil, err
		}
		count++
		if fileName.Valid && cacheState.String == "cached" {
			path := filepath.Join(ctx.MediaRoot, fileName.String)
			if _, err := os.Stat(path); err == nil {
				filePaths = append(filePaths, path)
				continue
			}
		}
		if (modality == "text" || modality == "conversation") && contentText.Valid && strings.TrimSpace(contentText.String) != "" {
			path := filepath.Join(root, safeName(title, ".txt", id))
			if err := os.WriteFile(path, []byte(contentText.String), 0o644); err != nil {
				return nil, err
			}
			filePaths = append(filePaths, path)
			continue
		}
		if strings.HasPrefix(sourceURL, "http://") || strings.HasPrefix(sourceURL, "https://") {
			links++
		}
		skipped++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if count != len(ids) {
		return nil, errors.New("部分素材不存在或已删除")
	}
	if len(filePaths) == 0 {
		return nil, &apiError{status: 400, code: "NO_COPYABLE_MATERIAL", message: "所选素材没有可复制的文件。没有本地副本的素材会在复制提示词时以链接提供。"}
	}
	if err := copyFilesToSystemClipboard(filePaths); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "copied": len(filePaths), "skipped": skipped, "linkReferences": links}, nil
}

func copyFilesToSystemClipboard(paths []string) error {
	switch runtime.GOOS {
	case "darwin":
		encoded, err := json.Marshal(paths)
		if err != nil {
			return err
		}
		script := `ObjC.import("AppKit"); const paths = ` + string(encoded) + `; const pasteboard = $.NSPasteboard.generalPasteboard; pasteboard.clearContents; const urls = $.NSMutableArray.array; paths.forEach((path) => urls.addObject($.NSURL.fileURLWithPath($(path)))); if (!pasteboard.writeObjects(urls)) throw new Error("Unable to write files to the clipboard.");`
		return runCommand("osascript", "-l", "JavaScript", "-e", script)
	case "windows":
		parts := make([]string, 0, len(paths))
		for _, path := range paths {
			parts = append(parts, "[void]$files.Add('"+strings.ReplaceAll(path, "'", "''")+"');")
		}
		script := "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; $files = New-Object System.Collections.Specialized.StringCollection; " + strings.Join(parts, " ") + " [System.Windows.Forms.Clipboard]::SetFileDropList($files); if (-not [System.Windows.Forms.Clipboard]::ContainsFileDropList()) { throw 'Unable to write files to the clipboard.' }"
		return runCommand("powershell.exe", "-NoProfile", "-STA", "-Command", script)
	default:
		return &apiError{status: 501, code: "FILE_CLIPBOARD_UNSUPPORTED", message: "当前系统暂不支持复制文本文件。请使用 macOS 或 Windows 桌面版。"}
	}
}

// clipboardFilePaths returns only files the user has explicitly placed on the
// system clipboard. It never accepts a path from the browser, which prevents a
// web page from using this helper to probe arbitrary local files.
func clipboardFilePaths() ([]string, error) {
	var output string
	var err error
	switch runtime.GOOS {
	case "darwin":
		script := `ObjC.import("AppKit"); const board=$.NSPasteboard.generalPasteboard; const classes=$.NSArray.arrayWithObject($.NSURL.class); const urls=board.readObjectsForClassesOptions(classes, null); const paths=[]; if (urls) { const count=Number(ObjC.unwrap(urls.count)); for (let i=0;i<count;i++) { const value=urls.objectAtIndex(i); if (ObjC.unwrap(value.isFileURL)) paths.push(ObjC.unwrap(value.path)); } } JSON.stringify(paths);`
		output, err = runCommandOutput("osascript", "-l", "JavaScript", "-e", script)
	case "windows":
		script := "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; if (-not [System.Windows.Forms.Clipboard]::ContainsFileDropList()) { '[]' } else { $paths = @([System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { $_.ToString() }); ConvertTo-Json -InputObject $paths -Compress }"
		output, err = runCommandOutput("powershell.exe", "-NoProfile", "-STA", "-Command", script)
	default:
		return nil, &apiError{status: 501, code: "FILE_CLIPBOARD_UNSUPPORTED", message: "当前系统不支持读取本地文件剪贴板。"}
	}
	if err != nil {
		return nil, err
	}
	return parseClipboardFilePaths(output)
}

// parseClipboardFilePaths accepts both output shapes emitted by PowerShell's
// ConvertTo-Json. A FileDropList with several paths is encoded as a JSON
// array, while some Windows / PowerShell combinations encode a single path as
// one JSON string. Treating the latter as an error made a valid one-file paste
// look like a failed whole batch.
func parseClipboardFilePaths(output string) ([]string, error) {
	value := strings.TrimSpace(output)
	paths := []string{}
	if err := json.Unmarshal([]byte(value), &paths); err == nil {
		return paths, nil
	}
	var path string
	if err := json.Unmarshal([]byte(value), &path); err == nil && path != "" {
		return []string{path}, nil
	}
	return nil, fmt.Errorf("无法读取系统剪贴板中的文件")
}

func runCommand(name string, args ...string) error {
	_, err := runCommandOutput(name, args...)
	return err
}

func runCommandOutput(name string, args ...string) (string, error) {
	output, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("无法访问系统剪贴板：%s", message)
	}
	return string(output), nil
}
