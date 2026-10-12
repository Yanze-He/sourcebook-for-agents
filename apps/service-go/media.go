package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func downloadImage(value string) ([]byte, string, string, error) {
	current := value
	for redirects := 0; redirects <= 4; redirects++ {
		parsed, err := publicHTTPSURL(current)
		if err != nil {
			return nil, "", "", err
		}
		client, err := publicHTTPClient(parsed)
		if err != nil {
			return nil, "", "", err
		}
		request, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
		if err != nil {
			return nil, "", "", err
		}
		request.Header.Set("user-agent", "Sourcebook Desktop")
		request.Header.Set("accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
		request.Header.Set("referer", parsed.Scheme+"://"+parsed.Host+"/")
		response, err := client.Do(request)
		if err != nil {
			return nil, "", "", err
		}
		if response.StatusCode >= 300 && response.StatusCode < 400 {
			location := response.Header.Get("location")
			_ = response.Body.Close()
			if location == "" {
				return nil, "", "", errors.New("图片重定向地址无效")
			}
			next, err := parsed.Parse(location)
			if err != nil {
				return nil, "", "", err
			}
			current = next.String()
			continue
		}
		if response.StatusCode != http.StatusOK {
			_ = response.Body.Close()
			return nil, "", "", fmt.Errorf("图片下载失败（%d）", response.StatusCode)
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, maxMediaBytes+1))
		_ = response.Body.Close()
		if err != nil {
			return nil, "", "", err
		}
		if len(data) > maxMediaBytes {
			return nil, "", "", errors.New("图片超过 20 MB")
		}
		mimeType, extension, err := imageType(data)
		if err != nil {
			return nil, "", "", err
		}
		return data, mimeType, extension, nil
	}
	return nil, "", "", errors.New("图片重定向次数过多")
}

func checkImageLink(value string) map[string]any {
	parsed, err := publicHTTPSURL(value)
	if err != nil {
		return map[string]any{"state": "invalid", "reason": "链接不是可访问的 HTTPS 地址"}
	}
	client, err := publicHTTPClient(parsed)
	if err != nil {
		return map[string]any{"state": "invalid", "reason": err.Error()}
	}
	request, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return map[string]any{"state": "invalid", "reason": "链接格式无效"}
	}
	request.Header.Set("range", "bytes=0-0")
	request.Header.Set("user-agent", "Sourcebook Link Check")
	response, err := client.Do(request)
	if err != nil {
		return map[string]any{"state": "unknown", "reason": err.Error()}
	}
	_ = response.Body.Close()
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return map[string]any{"state": "invalid", "reason": fmt.Sprintf("HTTP %d", response.StatusCode)}
	}
	if response.StatusCode >= 200 && response.StatusCode < 400 {
		return map[string]any{"state": "linked"}
	}
	return map[string]any{"state": "unknown", "reason": fmt.Sprintf("HTTP %d", response.StatusCode)}
}

func publicHTTPSURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Hostname() == "" || (parsed.Port() != "" && parsed.Port() != "443") {
		return nil, errors.New("图片需要公开的 HTTPS 地址")
	}
	if address := net.ParseIP(parsed.Hostname()); address != nil && !publicIPv4(address) {
		return nil, errors.New("不支持内部网络图片地址")
	}
	return parsed, nil
}

func publicHTTPClient(parsed *url.URL) (*http.Client, error) {
	addresses, err := net.LookupIP(parsed.Hostname())
	if err != nil {
		return nil, err
	}
	var address net.IP
	for _, candidate := range addresses {
		if publicIPv4(candidate) {
			address = candidate
			break
		}
	}
	if address == nil {
		return nil, errors.New("不支持内部网络图片地址")
	}
	port := parsed.Port()
	if port == "" {
		port = "443"
	}
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, net.JoinHostPort(address.String(), port))
		},
		TLSHandshakeTimeout: 15 * time.Second,
	}
	return &http.Client{Transport: transport, Timeout: 20 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, nil
}

func publicIPv4(address net.IP) bool {
	address = address.To4()
	if address == nil {
		return false
	}
	a, b := address[0], address[1]
	return !(a == 0 || a == 10 || a == 127 || a >= 224 || (a == 169 && b == 254) || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 100 && b >= 64 && b <= 127))
}

func linkStateAfterDownloadError(err error) string {
	message := err.Error()
	if strings.Contains(message, "图片下载失败（404）") || strings.Contains(message, "图片下载失败（410）") || strings.Contains(message, "公开的 HTTPS") || strings.Contains(message, "内部网络") {
		return "invalid"
	}
	return "linked"
}
