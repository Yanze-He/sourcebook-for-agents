package main

import (
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestParseClipboardFilePathsAcceptsWindowsSingleAndMultipleFiles(t *testing.T) {
	for _, test := range []struct {
		name string
		raw  string
		want []string
	}{
		{
			name: "multiple files",
			raw:  `["C:\\Users\\Zeke\\Desktop\\brief.pdf","C:\\Users\\Zeke\\Desktop\\reference-folder"]`,
			want: []string{`C:\Users\Zeke\Desktop\brief.pdf`, `C:\Users\Zeke\Desktop\reference-folder`},
		},
		{
			name: "one file",
			raw:  `"C:\\Users\\Zeke\\Desktop\\brief.pdf"`,
			want: []string{`C:\Users\Zeke\Desktop\brief.pdf`},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseClipboardFilePaths(test.raw)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("paths = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestParseClipboardFilePathsRejectsMalformedClipboardOutput(t *testing.T) {
	if _, err := parseClipboardFilePaths("not json"); err == nil {
		t.Fatal("expected malformed clipboard output to be rejected")
	}
}

func TestRevealLocalFileCommandUsesFolderOnWindows(t *testing.T) {
	filePath := `C:\Users\Zeke\Documents\Sourcebook\Book\assets\设计参考.zip`
	command := revealLocalFileCommand("windows", filePath)
	if command.Path != "explorer.exe" {
		t.Fatalf("command = %q, want explorer.exe", command.Path)
	}
	if got, want := command.Args, []string{"explorer.exe", `C:\Users\Zeke\Documents\Sourcebook\Book\assets`}; !reflect.DeepEqual(got, want) {
		t.Fatalf("args = %#v, want %#v", got, want)
	}
}

func TestWindowsParentFolderKeepsDriveRoot(t *testing.T) {
	if got, want := windowsParentFolder(`C:\brief.pdf`), `C:\`; got != want {
		t.Fatalf("folder = %q, want %q", got, want)
	}
}

func TestClipboardTextValidatesRequestBeforeWriting(t *testing.T) {
	server := &Server{}
	empty := httptest.NewRequest("POST", "/api/clipboard/text", strings.NewReader(`{"text":""}`))
	response := httptest.NewRecorder()
	err := server.clipboardText(response, empty)
	if err == nil {
		t.Fatal("empty clipboard text was accepted")
	}
	apiErr, ok := err.(*apiError)
	if !ok || apiErr.code != "CLIPBOARD_TEXT_REQUIRED" {
		t.Fatalf("error = %#v, want CLIPBOARD_TEXT_REQUIRED", err)
	}

	tooLarge := httptest.NewRequest("POST", "/api/clipboard/text", strings.NewReader(`{"text":"`+strings.Repeat("x", 256*1024+1)+`"}`))
	response = httptest.NewRecorder()
	err = server.clipboardText(response, tooLarge)
	if err == nil {
		t.Fatal("oversized clipboard text was accepted")
	}
	apiErr, ok = err.(*apiError)
	if !ok || apiErr.code != "CLIPBOARD_TEXT_TOO_LARGE" {
		t.Fatalf("error = %#v, want CLIPBOARD_TEXT_TOO_LARGE", err)
	}
}
