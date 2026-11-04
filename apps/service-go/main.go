package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
)

func main() {
	port := envInt("API_PORT", 4177)
	legacyDBPath := os.Getenv("SOURCEBOOK_DB_PATH")
	dataDirectory := sourcebookDataDirectory()
	if legacyDBPath == "" {
		legacyDBPath = filepath.Join(dataDirectory, "sourcebook.sqlite")
	}
	dataRoot := resolveLibraryRoot(dataDirectory, legacyDBPath)
	locationConfig := os.Getenv("SOURCEBOOK_LIBRARY_CONFIG")
	if locationConfig == "" {
		locationConfig = filepath.Join(dataDirectory, "library-location.json")
	}

	library, err := OpenLibrary(dataRoot, legacyDBPath, locationConfig)
	if err != nil {
		log.Fatal(err)
	}
	defer library.Close()

	server := NewServer(library, os.Getenv("SOURCEBOOK_SOURCES_WEB_DIR"))
	address := "127.0.0.1:" + strconv.Itoa(port)
	ipv4Listener, err := net.Listen("tcp4", address)
	if err != nil {
		log.Fatal(err)
	}
	// Older Codex page links use localhost, which some embedded browsers resolve
	// to ::1 without falling back to IPv4. Serve that loopback address too when
	// available, while keeping 127.0.0.1 as the required Desktop endpoint.
	ipv6Address := "[::1]:" + strconv.Itoa(port)
	if ipv6Listener, err := net.Listen("tcp6", ipv6Address); err == nil {
		go func() {
			log.Printf("Sourcebook Go service ready at http://%s", ipv6Address)
			if err := http.Serve(ipv6Listener, server); err != nil {
				log.Printf("Sourcebook IPv6 loopback listener stopped: %v", err)
			}
		}()
	} else {
		log.Printf("Sourcebook IPv6 loopback unavailable: %v", err)
	}
	log.Printf("Sourcebook Go service ready at http://%s", address)
	if err := http.Serve(ipv4Listener, server); err != nil {
		log.Fatal(err)
	}
}

func sourcebookDataDirectory() string {
	if explicit := os.Getenv("SOURCEBOOK_DATA_DIR"); explicit != "" {
		return explicit
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Sourcebook for Agents")
	case "windows":
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "Sourcebook for Agents")
		}
		return filepath.Join(home, "AppData", "Roaming", "Sourcebook for Agents")
	default:
		if dataHome := os.Getenv("XDG_DATA_HOME"); dataHome != "" {
			return filepath.Join(dataHome, "sourcebook-for-agents")
		}
		return filepath.Join(home, ".local", "share", "sourcebook-for-agents")
	}
}

func resolveLibraryRoot(dataDirectory, legacyDBPath string) string {
	if explicit := os.Getenv("SOURCEBOOK_LIBRARY_DIR"); explicit != "" {
		return explicit
	}
	// Tests and migration tooling can explicitly provide the legacy database path.
	if os.Getenv("SOURCEBOOK_DB_PATH") != "" {
		return filepath.Join(filepath.Dir(legacyDBPath), "Sourcebook Library")
	}
	configPath := os.Getenv("SOURCEBOOK_LIBRARY_CONFIG")
	if configPath == "" {
		configPath = filepath.Join(dataDirectory, "library-location.json")
	}
	var config struct {
		LibraryRoot string `json:"libraryRoot"`
	}
	if bytes, err := os.ReadFile(configPath); err == nil && json.Unmarshal(bytes, &config) == nil && config.LibraryRoot != "" {
		if _, err := os.Stat(config.LibraryRoot); err == nil {
			return config.LibraryRoot
		}
	}
	return filepath.Join(dataDirectory, "Sourcebook Library")
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil || value < 1 || value > 65535 {
		return fallback
	}
	return value
}
