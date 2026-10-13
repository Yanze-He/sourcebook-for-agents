package main

import (
	"reflect"
	"testing"
)

func TestVideoPreviewCandidatesKeepOrderedFallbacks(t *testing.T) {
	metadata := mergeMetadata(map[string]any{
		"thumbnailUrl": "https://i.ytimg.com/vi/example/maxresdefault.jpg",
		"thumbnailCandidates": []any{
			"https://i.ytimg.com/vi/example/maxresdefault.jpg",
			"https://i.ytimg.com/vi/example/hqdefault.jpg",
			"https://i.ytimg.com/vi/example/mqdefault.jpg",
		},
	}, "video")

	got := previewCandidates(metadata, "video")
	want := []string{
		"https://i.ytimg.com/vi/example/maxresdefault.jpg",
		"https://i.ytimg.com/vi/example/hqdefault.jpg",
		"https://i.ytimg.com/vi/example/mqdefault.jpg",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("preview candidates = %#v, want %#v", got, want)
	}
}

func TestPostPreviewCandidatesKeepXiaohongshuCoverFallbacks(t *testing.T) {
	metadata := mergeMetadata(map[string]any{
		"thumbnailUrl": "https://sns-video-hw.xhscdn.com/first-frame.webp",
		"thumbnailCandidates": []any{
			"https://sns-video-hw.xhscdn.com/first-frame.webp",
			"https://sns-img.xhscdn.com/fallback-frame.webp",
		},
	}, "post")

	got := previewCandidates(metadata, "post")
	want := []string{
		"https://sns-video-hw.xhscdn.com/first-frame.webp",
		"https://sns-img.xhscdn.com/fallback-frame.webp",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("preview candidates = %#v, want %#v", got, want)
	}
}
