//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	wmCreate       = 0x0001
	wmDestroy      = 0x0002
	wmClose        = 0x0010
	wmSysCommand   = 0x0112
	wmSetIcon      = 0x0080
	wmActivate     = 0x0006
	wmsCommand     = 0x0111
	scRestore      = 0xF120
	waInactive     = 0
	swShowMinNoAct = 7
	imageIcon      = 1
	lrLoadFromFile = 0x0010
	iconSmall      = 0
	iconBig        = 1
	mfString       = 0x0000
	mfSeparator    = 0x0800
	openCommandID  = 0x5001
	quitCommandID  = 0x5002
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
	procGetSystemMenu       = user32.NewProc("GetSystemMenu")
	procAppendMenu          = user32.NewProc("AppendMenuW")
	procLoadImage           = user32.NewProc("LoadImageW")
	procSendMessage         = user32.NewProc("SendMessageW")
	procGetModuleHandle     = syscall.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW")
	windowProcedureCallback = syscall.NewCallback(windowProcedure)

	serviceMu sync.Mutex
	service   *exec.Cmd
)

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
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		0x00CF0000, // WS_OVERLAPPEDWINDOW: gives the taskbar an app window.
		0, 0, 0, 0,
		0, 0, instance, 0,
	)
	if window == 0 {
		return
	}
	setWindowIcon(syscall.Handle(window))
	startService()
	time.AfterFunc(700*time.Millisecond, openSourcebook)
	procShowWindow.Call(window, swShowMinNoAct)

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
	case wmCreate:
		menu, _, _ := procGetSystemMenu.Call(uintptr(window), 0)
		if menu != 0 {
			procAppendMenu.Call(menu, mfSeparator, 0, 0)
			procAppendMenu.Call(menu, mfString, openCommandID, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Open Sourcebook"))))
			procAppendMenu.Call(menu, mfString, quitCommandID, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Quit Sourcebook Desktop"))))
		}
	case wmsCommand:
		switch wParam & 0xffff {
		case openCommandID:
			openSourcebook()
			return 0
		case quitCommandID:
			procDestroyWindow.Call(uintptr(window))
			return 0
		}
	case wmSysCommand:
		if wParam&0xfff0 == scRestore {
			openSourcebook()
			procShowWindow.Call(uintptr(window), swShowMinNoAct)
			return 0
		}
	case wmActivate:
		if wParam&0xffff != waInactive {
			openSourcebook()
			procShowWindow.Call(uintptr(window), swShowMinNoAct)
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

func startService() {
	serviceMu.Lock()
	defer serviceMu.Unlock()
	if service != nil && service.Process != nil {
		return
	}
	executable, err := os.Executable()
	if err != nil {
		return
	}
	root := filepath.Dir(executable)
	command := exec.Command(filepath.Join(root, "sourcebook-service.exe"))
	command.Env = append(os.Environ(), "SOURCEBOOK_SOURCES_WEB_DIR="+filepath.Join(root, "resources", "sources"))
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if command.Start() == nil {
		service = command
	}
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

func openSourcebook() {
	// rundll32 opens the user's default browser without showing a command shell.
	_ = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", "http://127.0.0.1:4177/").Start()
}

func setWindowIcon(window syscall.Handle) {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	iconPath := syscall.StringToUTF16Ptr(filepath.Join(filepath.Dir(executable), "SourcebookDesktop.ico"))
	icon, _, _ := procLoadImage.Call(0, uintptr(unsafe.Pointer(iconPath)), imageIcon, 0, 0, lrLoadFromFile)
	if icon == 0 {
		return
	}
	procSendMessage.Call(uintptr(window), wmSetIcon, iconSmall, icon)
	procSendMessage.Call(uintptr(window), wmSetIcon, iconBig, icon)
}
