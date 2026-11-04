// sourcebook-mcp-launcher is a stable, small stdio bootstrapper. Agent hosts
// register this file once; it reads the Desktop-owned marker at launch and
// delegates to the current Desktop package's real MCP server.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type desktopInstallMarker struct {
	MCPPath string `json:"mcpPath"`
}

func main() {
	server, err := currentDesktopMCP()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Sourcebook MCP:", err)
		os.Exit(1)
	}
	command := exec.Command(server, os.Args[1:]...)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.Env = os.Environ()
	if err := command.Run(); err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			os.Exit(exit.ExitCode())
		}
		fmt.Fprintln(os.Stderr, "Sourcebook MCP:", err)
		os.Exit(1)
	}
}

func currentDesktopMCP() (string, error) {
	contents, err := os.ReadFile(filepath.Join(sourcebookDataDirectory(), "desktop-install.json"))
	if err != nil {
		return "", errors.New("Sourcebook Desktop is not installed or has not been opened yet; open Sourcebook Desktop, then try again")
	}
	var marker desktopInstallMarker
	if err := json.Unmarshal(contents, &marker); err != nil {
		return "", errors.New("Sourcebook Desktop installation information is invalid; reopen or reinstall Sourcebook Desktop")
	}
	path := filepath.Clean(marker.MCPPath)
	if marker.MCPPath == "" || !filepath.IsAbs(path) || !isDesktopMCPPath(path) {
		return "", errors.New("this Sourcebook Desktop version cannot provide its local MCP server; update and reopen Sourcebook Desktop")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || (runtime.GOOS != "windows" && info.Mode()&0o111 == 0) {
		return "", errors.New("Sourcebook Desktop was moved, removed, or is incomplete; reopen or reinstall it")
	}
	return path, nil
}

func isDesktopMCPPath(path string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Base(path), "sourcebook-mcp.exe")
	}
	return filepath.Base(path) == "sourcebook-mcp" && strings.Contains(filepath.ToSlash(path), "/Sourcebook Desktop.app/Contents/Resources/")
}

func sourcebookDataDirectory() string {
	if explicit := os.Getenv("SOURCEBOOK_DATA_DIR"); explicit != "" {
		return explicit
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Sourcebook for Agents")
	}
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "Sourcebook for Agents")
		}
		return filepath.Join(home, "AppData", "Roaming", "Sourcebook for Agents")
	}
	return filepath.Join(home, ".local", "share", "sourcebook-for-agents")
}
