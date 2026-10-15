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
	wmCommand          = 0x0111
	wmApp              = 0x8000
	wmLeftButtonUp     = 0x0202
	wmLeftButtonDblClk = 0x0203
	wmRightButtonUp    = 0x0205
	wsExToolWindow     = 0x00000080
	imageIcon          = 1
	lrLoadFromFile     = 0x0010
	nimAdd             = 0x00000000
	nimDelete          = 0x00000002
	nifMessage         = 0x00000001
	nifIcon            = 0x00000002
	nifTip             = 0x00000004
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
	procLoadImage           = user32.NewProc("LoadImageW")
	procGetModuleHandle     = syscall.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW")
	procShellNotifyIcon     = syscall.NewLazyDLL("shell32.dll").NewProc("Shell_NotifyIconW")
	windowProcedureCallback = syscall.NewCallback(windowProcedure)

	serviceMu sync.Mutex
	service   *exec.Cmd
	// desktopBuild is injected by the Windows package script. It lets the host
	// distinguish the bundled service from an older Sourcebook still listening
	// on the shared Picker port after an update.
	desktopBuild = "0.1.0"
)

type serviceHealth struct {
	App     string `json:"app"`
	Version string `json:"version"`
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
	instance, _, _ := procGetModuleHandle.Call(0)
	className := syscall.StringToUTF16Ptr("SourcebookDesktopWindow")
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
		0, // A hidden tool window owns the system-tray icon without showing in the taskbar.
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

func windowProcedure(window syscall.Handle, messageID uint32, wParam, lParam uintptr) uintptr {
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
		switch uint32(lParam) {
		case wmLeftButtonUp, wmLeftButtonDblClk:
			openSourcebookWhenReady(0)
			return 0
		case wmRightButtonUp:
			showTrayMenu(window)
			return 0
		}
	case wmClose:
		procDestroyWindow.Call(uintptr(window))
		return 0
	case wmDestroy:
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
		if health.Version == desktopBuild {
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
	command := exec.Command(filepath.Join(root, "sourcebook-service.exe"))
	command.Env = append(os.Environ(), "SOURCEBOOK_SOURCES_WEB_DIR="+filepath.Join(root, "resources", "sources"))
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if command.Start() == nil {
		service = command
		return true
	}
	return false
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
	if health, running := runningSourcebookService(); running && health.Version == desktopBuild {
		openSourcebook()
		return
	}
	if attempt < 40 {
		time.AfterFunc(150*time.Millisecond, func() { openSourcebookWhenReady(attempt + 1) })
	}
}

func openSourcebook() {
	// A fresh query string forces an existing browser tab to reload the newly
	// bundled web app rather than showing an in-memory page from before update.
	target := "http://127.0.0.1:4177/?desktop=" + desktopBuild + "&openedAt=" + strconv.FormatInt(time.Now().UnixMilli(), 10)
	// rundll32 opens the user's default browser without showing a command shell.
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
	icon := loadTrayIcon()
	if icon == 0 {
		return false
	}
	data := notifyIconData{
		Size:            uint32(unsafe.Sizeof(notifyIconData{})),
		Window:          window,
		ID:              trayIconID,
		Flags:           nifMessage | nifIcon | nifTip,
		CallbackMessage: trayCallback,
		Icon:            icon,
	}
	copy(data.Tip[:], syscall.StringToUTF16("Sourcebook for Agents"))
	result, _, _ := procShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&data)))
	return result != 0
}

func removeTrayIcon(window syscall.Handle) {
	data := notifyIconData{
		Size:   uint32(unsafe.Sizeof(notifyIconData{})),
		Window: window,
		ID:     trayIconID,
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
}
