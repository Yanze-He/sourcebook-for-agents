import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { collectVideoCoverCandidates, uniqueCoverCandidates } from "../src/shared/page.ts";

function videoFrom(markup) {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${markup}</body></html>`);
  return { document, video: document.querySelector("video") };
}

describe("video cover candidates", () => {
  it("keeps all YouTube cover fallbacks when the player exposes a blob poster", () => {
    const { document, video } = videoFrom('<video poster="blob:https://www.youtube.com/cover"></video>');
    const candidates = collectVideoCoverCandidates(video, document, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    assert.equal(candidates.some((value) => value.startsWith("blob:")), false);
    assert.deepEqual(candidates.slice(-4), [
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg"
    ]);
  });

  it("keeps Bilibili player and page metadata covers in priority order", () => {
    const { document } = parseHTML('<!doctype html><html><head><meta property="og:image" content="https://i0.hdslb.com/meta-cover.jpg"></head><body><div class="bpx-player-container"><video poster="https://i0.hdslb.com/player-cover.jpg"></video></div></body></html>');
    const candidates = collectVideoCoverCandidates(document.querySelector("video"), document, "https://www.bilibili.com/video/BV1xx411c7mD");

    assert.deepEqual(candidates.slice(0, 2), [
      "https://i0.hdslb.com/player-cover.jpg",
      "https://i0.hdslb.com/meta-cover.jpg"
    ]);
  });

  it("keeps Xiaohongshu video first-frame data while rejecting avatar and video URLs", () => {
    const { document, video } = videoFrom('<section class="video-player" data-cover="https://sns-video-hw.xhscdn.com/first-frame.webp"><img class="avatar" src="https://sns-avatar.xhscdn.com/avatar.webp"><img data-src="https://sns-img.xhscdn.com/second-frame.webp"><video poster="blob:https://www.xiaohongshu.com/cover" src="https://sns-video-hw.xhscdn.com/clip.mp4"></video></section>');
    const candidates = collectVideoCoverCandidates(video, document, "https://www.xiaohongshu.com/explore/abc123");

    assert.equal(candidates[0], "https://sns-video-hw.xhscdn.com/first-frame.webp");
    assert.equal(candidates.includes("https://sns-avatar.xhscdn.com/avatar.webp"), false);
    assert.equal(candidates.some((value) => value.endsWith(".mp4")), false);
  });

  it("recognizes Xiaohongshu player wrapper aliases used for first-frame URLs", () => {
    const { document, video } = videoFrom('<section class="video-player" data-video-cover="https://sns-video-hw.xhscdn.com/video-cover.webp" data-first-frame-url="https://sns-video-hw.xhscdn.com/first-frame.webp"><video poster="blob:https://www.xiaohongshu.com/cover"></video></section>');
    const candidates = collectVideoCoverCandidates(video, document, "https://www.xiaohongshu.com/explore/abc123");

    assert.deepEqual(candidates.slice(0, 2), [
      "https://sns-video-hw.xhscdn.com/video-cover.webp",
      "https://sns-video-hw.xhscdn.com/first-frame.webp"
    ]);
  });

  it("drops non-portable image sources before the background downloader receives them", () => {
    assert.deepEqual(uniqueCoverCandidates([
      "blob:https://www.youtube.com/cover",
      "data:image/png;base64,abc",
      "https://cdn.example.com/movie.mp4",
      "https://cdn.example.com/cover.webp",
      "https://cdn.example.com/cover.webp"
    ]), ["https://cdn.example.com/cover.webp"]);
  });
});
