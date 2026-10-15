package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const updateRepository = "Yanze-He/sourcebook-for-agents"

// appVersion is replaced by the desktop package scripts for release builds.
var appVersion = "0.1.0"

type releaseInfo struct {
	Version     string `json:"version"`
	Name        string `json:"name"`
	Notes       string `json:"notes"`
	URL         string `json:"url"`
	PublishedAt string `json:"publishedAt"`
}

func (server *Server) getLibrarySettings(response http.ResponseWriter) error {
	root, defaultRoot, configured := server.library.Location()
	isEmpty, err := server.library.IsEmpty()
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"libraryRoot": root, "defaultRoot": defaultRoot, "configured": configured, "requiresSetup": !configured, "isEmpty": isEmpty})
	return nil
}

func (server *Server) updateLibrarySettings(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	destination, err := filepath.Abs(strings.TrimSpace(stringValue(value["destination"])))
	if err != nil || destination == "" {
		return &apiError{status: http.StatusBadRequest, code: "LIBRARY_LOCATION_REQUIRED", message: "请选择素材库位置。"}
	}
	if destination == server.library.root {
		if err := server.library.ConfirmLocation(); err != nil {
			return err
		}
	} else if _, err := server.library.Migrate(destination); err != nil {
		return err
	}
	return server.getLibrarySettings(response)
}

func (server *Server) chooseLibraryLocation(response http.ResponseWriter) error {
	// The chooser returns a parent folder, so open it beside the current library.
	// That makes the current Sourcebook Library immediately visible as a reference.
	path, err := chooseDirectory(filepath.Dir(server.library.root))
	if err != nil {
		return err
	}
	if path == "" {
		writeJSON(response, http.StatusOK, map[string]any{"destination": nil})
		return nil
	}
	// The native chooser asks for a parent folder. Sourcebook creates its own
	// named library inside it so unrelated files are never mixed into the library.
	writeJSON(response, http.StatusOK, map[string]any{"destination": filepath.Join(path, filepath.Base(server.library.root))})
	return nil
}

func (server *Server) revealLibraryLocation(response http.ResponseWriter) error {
	if err := revealLibraryInFileManager(server.library.root); err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, map[string]any{"ok": true})
	return nil
}

func chooseDirectory(defaultPath string) (string, error) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("osascript", "-e", "POSIX path of (choose folder with prompt \"Choose a folder for Sourcebook Library\" default location POSIX file "+appleScriptString(defaultPath)+")")
	case "windows":
		command = exec.Command("powershell.exe", "-NoProfile", "-STA", "-Command", "Add-Type -AssemblyName System.Windows.Forms; $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='Choose a folder for Sourcebook Library'; $dialog.SelectedPath='"+powerShellSingleQuoted(defaultPath)+"'; if($dialog.ShowDialog() -eq 'OK'){[Console]::Write($dialog.SelectedPath)}")
	default:
		return "", &apiError{status: http.StatusNotImplemented, code: "FOLDER_CHOOSER_UNSUPPORTED", message: "当前系统暂不支持选择本地文件夹。"}
	}
	output, err := command.Output()
	if err != nil {
		// Cancelling the picker is a normal outcome, not an error shown to users.
		if exit, ok := err.(*exec.ExitError); ok && exit.ExitCode() != 0 {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func appleScriptString(value string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(value, `\`, `\\`), `"`, `\"`) + `"`
}

func powerShellSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func revealLibraryInFileManager(path string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", "-R", path)
	case "windows":
		command = exec.Command("explorer.exe", "/select,"+path)
	default:
		command = exec.Command("xdg-open", filepath.Dir(path))
	}
	return command.Start()
}

func (server *Server) getUpdateSettings(response http.ResponseWriter, request *http.Request) error {
	settings, err := server.readDesktopSettings()
	if err != nil {
		return err
	}
	force := request.URL.Query().Get("check") == "1"
	if force || (automaticUpdateChecks(settings) && updateCheckDue(settings.LastUpdateCheck)) {
		settings = server.checkForUpdates(settings)
		if saved, saveErr := server.writeDesktopSettings(settings); saveErr == nil {
			settings = saved
		}
	}
	writeJSON(response, http.StatusOK, updateSettingsPayload(settings))
	return nil
}

func (server *Server) updateUpdateSettings(response http.ResponseWriter, request *http.Request) error {
	value, err := readBody(request)
	if err != nil {
		return err
	}
	settings, err := server.readDesktopSettings()
	if err != nil {
		return err
	}
	if raw, ok := value["autoCheck"].(bool); ok {
		settings.AutoUpdateCheck = &raw
	}
	settings, err = server.writeDesktopSettings(settings)
	if err != nil {
		return err
	}
	writeJSON(response, http.StatusOK, updateSettingsPayload(settings))
	return nil
}

func automaticUpdateChecks(settings desktopSettings) bool {
	return settings.AutoUpdateCheck == nil || *settings.AutoUpdateCheck
}

func updateCheckDue(last string) bool {
	checkedAt, err := time.Parse(time.RFC3339Nano, last)
	return err != nil || time.Since(checkedAt) >= 24*time.Hour
}

func (server *Server) checkForUpdates(settings desktopSettings) desktopSettings {
	settings.LastUpdateCheck = now()
	settings.UpdateError = ""
	latest, err := fetchLatestRelease()
	if err != nil {
		settings.UpdateError = "无法检查更新：" + err.Error()
		return settings
	}
	if compareVersions(latest.Version, appVersion) > 0 {
		settings.AvailableRelease = &latest
	} else {
		settings.AvailableRelease = nil
	}
	return settings
}

func updateSettingsPayload(settings desktopSettings) map[string]any {
	status := "idle"
	if settings.UpdateError != "" {
		status = "error"
	} else if settings.AvailableRelease != nil {
		status = "available"
	} else if settings.LastUpdateCheck != "" {
		status = "upToDate"
	}
	return map[string]any{"version": appVersion, "autoCheck": automaticUpdateChecks(settings), "lastCheckedAt": settings.LastUpdateCheck, "release": settings.AvailableRelease, "status": status, "error": settings.UpdateError}
}

func fetchLatestRelease() (releaseInfo, error) {
	request, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+updateRepository+"/releases?per_page=100", nil)
	if err != nil {
		return releaseInfo{}, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "Sourcebook-for-Agents/"+appVersion)
	response, err := (&http.Client{Timeout: 8 * time.Second}).Do(request)
	if err != nil {
		return releaseInfo{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return releaseInfo{}, errors.New("GitHub returned " + response.Status)
	}
	var releases []struct {
		Draft       bool   `json:"draft"`
		TagName     string `json:"tag_name"`
		Name        string `json:"name"`
		Body        string `json:"body"`
		HTMLURL     string `json:"html_url"`
		PublishedAt string `json:"published_at"`
	}
	if err := json.NewDecoder(response.Body).Decode(&releases); err != nil {
		return releaseInfo{}, err
	}
	options := []releaseInfo{}
	for _, release := range releases {
		version := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
		if release.Draft || !isSemanticVersion(version) {
			continue
		}
		options = append(options, releaseInfo{Version: version, Name: firstString(release.Name, "v"+version), Notes: strings.TrimSpace(release.Body), URL: release.HTMLURL, PublishedAt: release.PublishedAt})
	}
	if len(options) == 0 {
		return releaseInfo{}, errors.New("没有可用的正式或预发布版本")
	}
	sort.Slice(options, func(i, j int) bool { return compareVersions(options[i].Version, options[j].Version) > 0 })
	return options[0], nil
}

func isSemanticVersion(version string) bool {
	parts := strings.SplitN(version, "-", 2)
	core := strings.Split(parts[0], ".")
	if len(core) != 3 {
		return false
	}
	for _, part := range core {
		if _, err := strconv.Atoi(part); err != nil {
			return false
		}
	}
	return true
}

func compareVersions(left, right string) int {
	leftParts, rightParts := strings.SplitN(left, "-", 2), strings.SplitN(right, "-", 2)
	for index, raw := range strings.Split(leftParts[0], ".") {
		leftValue, _ := strconv.Atoi(raw)
		rightValue, _ := strconv.Atoi(strings.Split(rightParts[0], ".")[index])
		if leftValue > rightValue {
			return 1
		}
		if leftValue < rightValue {
			return -1
		}
	}
	leftPre, rightPre := "", ""
	if len(leftParts) == 2 {
		leftPre = leftParts[1]
	}
	if len(rightParts) == 2 {
		rightPre = rightParts[1]
	}
	if leftPre == rightPre {
		return 0
	}
	if leftPre == "" {
		return 1
	}
	if rightPre == "" {
		return -1
	}
	leftIdentifiers, rightIdentifiers := strings.Split(leftPre, "."), strings.Split(rightPre, ".")
	for index := 0; index < len(leftIdentifiers) && index < len(rightIdentifiers); index++ {
		leftIdentifier, rightIdentifier := leftIdentifiers[index], rightIdentifiers[index]
		leftNumber, leftIsNumber := strconv.Atoi(leftIdentifier)
		rightNumber, rightIsNumber := strconv.Atoi(rightIdentifier)
		if leftIsNumber == nil && rightIsNumber == nil {
			if leftNumber > rightNumber {
				return 1
			}
			if leftNumber < rightNumber {
				return -1
			}
			continue
		}
		if leftIsNumber == nil {
			return -1
		}
		if rightIsNumber == nil {
			return 1
		}
		if leftIdentifier > rightIdentifier {
			return 1
		}
		if leftIdentifier < rightIdentifier {
			return -1
		}
	}
	if len(leftIdentifiers) > len(rightIdentifiers) {
		return 1
	}
	if len(leftIdentifiers) < len(rightIdentifiers) {
		return -1
	}
	return 0
}
