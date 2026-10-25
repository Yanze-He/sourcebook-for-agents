package main

import (
	"reflect"
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
