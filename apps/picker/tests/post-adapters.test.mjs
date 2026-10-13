import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { detectPost } from "../src/post/adapters.ts";

describe("post adapters", () => {
  it("keeps Xiaohongshu lazy-load and metadata cover candidates", () => {
    const { document } = parseHTML(`<!doctype html><html><head><meta property="og:image" content="https://ci.xiaohongshu.com/meta-cover.webp"></head><body><main id="noteContainer"><h1>Reference title</h1><div class="desc">A saved Xiaohongshu note.</div><img data-src="https://ci.xiaohongshu.com/lazy-cover.webp" width="640" height="852"></main></body></html>`);
    const detection = detectPost(document, "https://www.xiaohongshu.com/explore/abc123");

    assert.equal(detection?.platform, "xiaohongshu");
    assert.equal(detection?.post.title, "Reference title");
    assert.deepEqual(detection?.thumbnailCandidates, ["https://ci.xiaohongshu.com/lazy-cover.webp", "https://ci.xiaohongshu.com/meta-cover.webp"]);
  });

  it("prefers a video cover and excludes author avatars from the preview chain", () => {
    const { document } = parseHTML(`<!doctype html><html><body><main id="noteContainer"><div class="author-profile"><img class="avatar" src="https://ci.xiaohongshu.com/avatar.webp" width="64" height="64"></div><section class="note-slider"><div class="video-player" data-video-url="https://cdn.xiaohongshu.com/clip.mp4" data-cover="https://ci.xiaohongshu.com/video-cover.webp"></div><img data-src="https://ci.xiaohongshu.com/second-frame.webp" width="640" height="852"></section></main></body></html>`);
    const detection = detectPost(document, "https://www.xiaohongshu.com/explore/video123");

    assert.equal(detection?.thumbnailUrl, "https://ci.xiaohongshu.com/video-cover.webp");
    assert.equal(detection?.thumbnailCandidates?.includes("https://ci.xiaohongshu.com/avatar.webp"), false);
    assert.equal("media" in (detection?.post || {}), false);
  });

  it("reads a Xiaohongshu video first-frame URL from embedded page state", () => {
    const { document } = parseHTML(`<!doctype html><html><body><main id="noteContainer"><div class="desc">A video note.</div></main><script>window.__INITIAL_STATE__={"video":{"firstFrame":{"urlPre":"https:\\/\\/ci.xiaohongshu.com\\/first-frame.webp"}}}</script></body></html>`);
    const detection = detectPost(document, "https://www.xiaohongshu.com/explore/video456");

    assert.equal(detection?.thumbnailUrl, "https://ci.xiaohongshu.com/first-frame.webp");
  });

  it("uses a nested video-state image before unrelated note imagery", () => {
    const { document } = parseHTML(`<!doctype html><html><body><main id="noteContainer"><div class="video-shell" data-video-url="https://cdn.xiaohongshu.com/clip.mp4"><img class="poster" data-src="https://ci.xiaohongshu.com/dom-cover.webp"></div><img data-src="https://ci.xiaohongshu.com/note-image.webp" width="640" height="852"></main><script>window.__INITIAL_STATE__={"videoInfo":{"image":{"urlDefault":"https:\\/\\/ci.xiaohongshu.com\\/state-cover.webp"}}}</script></body></html>`);
    const detection = detectPost(document, "https://www.xiaohongshu.com/explore/video789");

    assert.equal(detection?.thumbnailUrl, "https://ci.xiaohongshu.com/dom-cover.webp");
    assert.equal(detection?.thumbnailCandidates?.includes("https://ci.xiaohongshu.com/state-cover.webp"), true);
  });
});
