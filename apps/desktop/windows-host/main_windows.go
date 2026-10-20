//go:build windows

package main

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	wmDestroy          = 0x0002
	wmClose            = 0x0010
	wmNull             = 0x0000
	wmCommand          = 0x0111
	wmContextMenu      = 0x007B
	wmApp              = 0x8000
	wmLeftButtonUp     = 0x0202
	wmLeftButtonDblClk = 0x0203
	wmRightButtonUp    = 0x0205
	ninSelect          = 0x0400
	ninKeySelect       = 0x0401
	wsExToolWindow     = 0x00000080
	imageIcon          = 1
	lrLoadFromFile     = 0x0010
	nimAdd             = 0x00000000
	nimDelete          = 0x00000002
	nimSetVersion      = 0x00000004
	nifMessage         = 0x00000001
	nifIcon            = 0x00000002
	nifTip             = 0x00000004
	nifGuid            = 0x00000020
	notifyIconVersion4 = 4
	mfString           = 0x0000
	mfSeparator        = 0x0800
	tpmRightButton     = 0x0002
	trayCallback       = wmApp + 1
	trayIconID         = 1
	openCommandID      = 0x5001
	quitCommandID      = 0x5002
)

var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	procDefWindowProc       = user32.NewProc("DefWindowProcW")
	procRegisterClassEx     = user32.NewProc("RegisterClassExW")
	procCreateWindowEx      = user32.NewProc("CreateWindowExW")
	procShowWindow          = user32.NewProc("ShowWindow")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procGetMessage          = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessage     = user32.NewProc("DispatchMessageW")
	procCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	procDestroyMenu         = user32.NewProc("DestroyMenu")
	procAppendMenu          = user32.NewProc("AppendMenuW")
	procTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	procGetCursorPos        = user32.NewProc("GetCursorPos")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procPostMessage         = user32.NewProc("PostMessageW")
	procFindWindow          = user32.NewProc("FindWindowW")
	procLoadImage           = user32.NewProc("LoadImageW")
	procGetModuleHandle     = syscall.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW")
	procCreateMutex         = syscall.NewLazyDLL("kernel32.dll").NewProc("CreateMutexW")
	procCloseHandle         = syscall.NewLazyDLL("kernel32.dll").NewProc("CloseHandle")
	procShellNotifyIcon     = syscall.NewLazyDLL("shell32.dll").NewProc("Shell_NotifyIconW")
	windowProcedureCallback = syscall.NewCallback(windowProcedure)
	taskbarCreatedMessage   uintptr
	sourcebookTrayGUID      = [16]byte{0x8d, 0x4a, 0x1f, 0x95, 0x53, 0xa2, 0x4b, 0x16, 0xa3, 0x8c, 0x71, 0x2e, 0x10, 0x9f, 0x6b, 0x42}

	serviceMu sync.Mutex
	service   *exec.Cmd
	// desktopVersion and desktopArtifactBuild are injected by the package script.
	// Together they distinguish a tested candidate from an older Sourcebook
	// service still listening on the shared Picker port after an update.
	desktopVersion       = "0.1.0"
	desktopArtifactBuild = ""
)

type serviceHealth struct {
	App     string `json:"app"`
	Version string `json:"version"`
	Build   string `json:"build"`
}

type point struct{ X, Y int32 }

type message struct {
	Window  syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Point   point
	Private uint32
}

type windowClassEx struct {
	Size        uint32
	Style       uint32
	WindowProc  uintptr
	ClassExtra  int32
	WindowExtra int32
	Instance    syscall.Handle
	Icon        syscall.Handle
	Cursor      syscall.Handle
	Background  syscall.Handle
	MenuName    *uint16
	ClassName   *uint16
	IconSmall   syscall.Handle
}

type notifyIconData struct {
	Size             uint32
	Window           syscall.Handle
	ID               uint32
	Flags            uint32
	CallbackMessage  uint32
	Icon             syscall.Handle
	Tip              [128]uint16
	State            uint32
	StateMask        uint32
	Info             [256]uint16
	TimeoutOrVersion uint32
	InfoTitle        [64]uint16
	InfoFlags        uint32
	GUID             [16]byte
	BalloonIcon      syscall.Handle
}

func main() {
	mutexName := syscall.StringToUTF16Ptr("Local\\SourcebookDesktopTray")
	mutex, _, mutexErr := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(mutexName)))
	if mutex == 0 {
		return
	}
	defer procCloseHandle.Call(mutex)
	if mutexErr == syscall.Errno(183) {
		className := syscall.StringToUTF16Ptr("SourcebookDesktopWindow")
		title := syscall.StringToUTF16Ptr("Sourcebook Desktop")
		if window, _, _ := procFindWindow.Call(uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title))); window != 0 {
			procPostMessage.Call(window, wmCommand, openCommandID, 0)
		}
		return
	}
	writeDesktopInstallMarker()
	instance, _, _ := procGetModuleHandle.Call(0)
	className := syscall.StringToUTF16Ptr("SourcebookDesktopWindow")
	taskbarCreatedMessage, _, _ = user32.NewProc("RegisterWindowMessageW").Call(uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("TaskbarCreated"))))
	windowClass := windowClassEx{
		Size:       uint32(unsafe.Sizeof(windowClassEx{})),
		WindowProc: windowProcedureCallback,
		Instance:   syscall.Handle(instance),
		ClassName:  className,
	}
	if atom, _, _ := procRegisterClassEx.Call(uintptr(unsafe.Pointer(&windowClass))); atom == 0 {
		return
	}

	title := syscall.StringToUTF16Ptr("Sourcebook Desktop")
	window, _, _ := procCreateWindowEx.Call(
		wsExToolWindow,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		0, // The hidden tool window owns the tray icon and has no taskbar button.
		0, 0, 0, 0,
		0, 0, instance, 0,
	)
	if window == 0 {
		return
	}
	if !addTrayIcon(syscall.Handle(window)) {
		procDestroyWindow.Call(window)
		return
	}
	defer removeTrayIcon(syscall.Handle(window))
	if startService() {
		openSourcebookWhenReady(0)
	}

	var current message
	for {
		result, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&current)), 0, 0, 0)
		if int32(result) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&current)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&current)))
	}
	stopService()
}

func writeDesktopInstallMarker() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	config, err := os.UserConfigDir()
	if err != nil {
		return
	}
	folder := filepath.Join(config, "Sourcebook for Agents")
	if os.MkdirAll(folder, 0o700) != nil {
		return
	}
	contents, err := json.Marshal(map[string]string{"path": executable})
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(folder, "desktop-install.json"), contents, 0o600)
}

func windowProcedure(window syscall.Handle, messageID uint32, wParam, lParam uintptr) uintptr {
	if uintptr(messageID) == taskbarCreatedMessage && taskbarCreatedMessage != 0 {
		addTrayIcon(window)
		return 0
	}
	switch messageID {
	case wmCommand:
		switch wParam & 0xffff {
		case openCommandID:
			openSourcebookWhenReady(0)
			return 0
		case quitCommandID:
			procDestroyWindow.Call(uintptr(window))
			return 0
		}
	case trayCallback:
		event := uint32(uint16(lParam))
		switch event {
		case wmLeftButtonUp, wmLeftButtonDblClk, ninSelect, ninKeySelect:
			openSourcebookWhenReady(0)
			return 0
		case wmRightButtonUp, wmContextMenu:
			showTrayMenu(window)
			return 0
		}
	case wmClose:
		procDestroyWindow.Call(uintptr(window))
		return 0
	case wmDestroy:
		removeTrayIcon(window)
		procPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := procDefWindowProc.Call(uintptr(window), uintptr(messageID), wParam, lParam)
	return result
}

func startService() bool {
	serviceMu.Lock()
	defer serviceMu.Unlock()
	if service != nil && service.Process != nil {
		return true
	}
	if health, running := runningSourcebookService(); running {
		if health.Version == desktopVersion && health.Build == desktopArtifactBuild {
			return true
		}
		if !stopOlderSourcebookService() {
			return false
		}
	}
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	root := filepath.Dir(executable)
	agentPlugin, err := synchronizeAgentPlugin(root)
	if err != nil {
		agentPlugin = ""
	}
	command := exec.Command(filepath.Join(root, "sourcebook-service.exe"))
	environment := append(os.Environ(), "SOURCEBOOK_SOURCES_WEB_DIR="+filepath.Join(root, "resources", "sources"))
	if agentPlugin != "" {
		environment = append(environment, "SOURCEBOOK_AGENT_PLUGIN_DIR="+agentPlugin)
	}
	command.Env = environment
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if command.Start() == nil {
		service = command
		return true
	}
	return false
}

func synchronizeAgentPlugin(root string) (string, error) {
	source := filepath.Join(root, "resources", "agent-plugin")
	if info, err := os.Stat(source); err != nil || !info.IsDir() {
		return "", os.ErrNotExist
	}
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	parent := filepath.Join(config, "Sourcebook for Agents")
	destination := filepath.Join(parent, "agent-plugin")
	staging := destination + ".next"
	backup := destination + ".previous"
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return "", err
	}
	_ = os.RemoveAll(staging)
	_ = os.RemoveAll(backup)
	if err := copyDirectory(source, staging); err != nil {
		_ = os.RemoveAll(staging)
		return "", err
	}
	for _, path := range []string{
		filepath.Join(staging, ".agents", "plugins", "sourcebook", "bin", "sourcebook-mcp.exe"),
		filepath.Join(staging, ".agents", "plugins", "marketplace.json"),
		filepath.Join(staging, ".agents", "plugins", "sourcebook", "skills", "sourcebook", "SKILL.md"),
		filepath.Join(staging, "INSTALL-CODEX.md"),
		filepath.Join(staging, "INSTALL-WORKBUDDY.md"),
		filepath.Join(staging, "INSTALL-MCP.md"),
		filepath.Join(staging, "agent-version.json"),
	} {
		if info, err := os.Stat(path); err != nil || info.IsDir() {
			_ = os.RemoveAll(staging)
			return "", os.ErrNotExist
		}
	}
	_, destinationErr := os.Stat(destination)
	hadDestination := destinationErr == nil
	if hadDestination {
		if err := os.Rename(destination, backup); err != nil {
			_ = os.RemoveAll(staging)
			return "", err
		}
	}
	if err := os.Rename(staging, destination); err != nil {
		if hadDestination {
			_ = os.Rename(backup, destination)
		}
		return "", err
	}
	_ = os.RemoveAll(backup)
	return destination, nil
}

func copyDirectory(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o700)
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return os.WriteFile(target, contents, info.Mode())
	})
}

func stopService() {
	serviceMu.Lock()
	defer serviceMu.Unlock()
	if service != nil && service.Process != nil {
		_ = service.Process.Kill()
		_, _ = service.Process.Wait()
	}
	service = nil
}

func runningSourcebookService() (serviceHealth, bool) {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	response, err := client.Get("http://127.0.0.1:4177/api/health")
	if err != nil {
		return serviceHealth{}, false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return serviceHealth{}, false
	}
	var health serviceHealth
	if err := json.NewDecoder(response.Body).Decode(&health); err != nil || health.App != "sourcebook-for-agents" {
		return serviceHealth{}, false
	}
	return health, true
}

func stopOlderSourcebookService() bool {
	output, err := exec.Command("netstat", "-ano", "-p", "tcp").Output()
	if err != nil {
		return false
	}
	var pid string
	for _, line := range strings.Split(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 || !strings.EqualFold(fields[3], "LISTENING") {
			continue
		}
		if fields[1] == "127.0.0.1:4177" || fields[1] == "[::1]:4177" {
			pid = fields[len(fields)-1]
			break
		}
	}
	if pid == "" || exec.Command("taskkill", "/PID", pid, "/T", "/F").Run() != nil {
		return false
	}
	for attempt := 0; attempt < 12; attempt++ {
		if _, running := runningSourcebookService(); !running {
			return true
		}
		time.Sleep(150 * time.Millisecond)
	}
	return false
}

func openSourcebookWhenReady(attempt int) {
	if health, running := runningSourcebookService(); running && health.Version == desktopVersion && health.Build == desktopArtifactBuild {
		openSourcebook()
		return
	}
	if attempt < 40 {
		time.AfterFunc(150*time.Millisecond, func() { openSourcebookWhenReady(attempt + 1) })
	}
}

func openSourcebook() {
	// Delegate to the default browser. Its window and tab lifetime is independent
	// from this tray host, which stays active until the user quits from the tray.
	target := "http://127.0.0.1:4177/?desktop=" + desktopVersion + "&build=" + desktopArtifactBuild + "&openedAt=" + strconv.FormatInt(time.Now().UnixMilli(), 10)
	// rundll32 invokes the registered URL handler without showing a command shell.
	_ = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", target).Start()
}

func loadTrayIcon() syscall.Handle {
	executable, err := os.Executable()
	if err != nil {
		return 0
	}
	iconPath := syscall.StringToUTF16Ptr(filepath.Join(filepath.Dir(executable), "SourcebookDesktop.ico"))
	icon, _, _ := procLoadImage.Call(0, uintptr(unsafe.Pointer(iconPath)), imageIcon, 0, 0, lrLoadFromFile)
	return syscall.Handle(icon)
}

func addTrayIcon(window syscall.Handle) bool {
	removeTrayIcon(window)
	icon := loadTrayIcon()
	if icon == 0 {
		return false
	}
	data := notifyIconData{
		Size:            uint32(unsafe.Sizeof(notifyIconData{})),
		Window:          window,
		ID:              trayIconID,
		Flags:           nifMessage | nifIcon | nifTip | nifGuid,
		CallbackMessage: trayCallback,
		Icon:            icon,
		GUID:            sourcebookTrayGUID,
	}
	copy(data.Tip[:], syscall.StringToUTF16("Sourcebook for Agents"))
	result, _, _ := procShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&data)))
	if result == 0 {
		return false
	}
	data.TimeoutOrVersion = notifyIconVersion4
	_, _, _ = procShellNotifyIcon.Call(nimSetVersion, uintptr(unsafe.Pointer(&data)))
	return true
}

func removeTrayIcon(window syscall.Handle) {
	data := notifyIconData{
		Size:   uint32(unsafe.Sizeof(notifyIconData{})),
		Window: window,
		ID:     trayIconID,
		Flags:  nifGuid,
		GUID:   sourcebookTrayGUID,
	}
	procShellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&data)))
}

func showTrayMenu(window syscall.Handle) {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)
	procAppendMenu.Call(menu, mfString, openCommandID, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Open Sourcebook"))))
	procAppendMenu.Call(menu, mfSeparator, 0, 0)
	procAppendMenu.Call(menu, mfString, quitCommandID, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Quit Sourcebook Desktop"))))

	var position point
	if result, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&position))); result == 0 {
		return
	}
	procSetForegroundWindow.Call(uintptr(window))
	procTrackPopupMenu.Call(menu, tpmRightButton, uintptr(position.X), uintptr(position.Y), 0, uintptr(window), 0)
	procPostMessage.Call(uintptr(window), wmNull, 0, 0)
}
