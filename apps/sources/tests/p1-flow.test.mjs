import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "sourcebook-public-"));
const port = 44000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let service;

before(async () => {
  service = spawn(process.execPath, ["server/local-api.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, API_PORT: String(port), SOURCEBOOK_DB_PATH: join(directory, "sourcebook.sqlite"), SOURCEBOOK_EXPORT_DIR: join(directory, "exports") },
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch { /* wait for the local process */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Local Sources API did not start");
});

after(() => service?.kill("SIGTERM"));

test("Pick -> Sources -> Pack works without Canvas records", async () => {
  const pick = await post("/api/picks", {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "text",
    pickType: "selection",
    contentText: "A reference intended for a standalone Sourcebook Pack.",
    sourceUrl: "https://example.com/reference",
    sourceTitle: "Reference",
    sourceOrigin: "https://example.com",
    pickedAt: "2026-10-07T12:00:00.000Z",
  });
  const sources = await get("/api/sources");
  assert.equal(sources.items.length, 1);
  assert.match(sources.items[0].contentText, /standalone Sourcebook Pack/);
  assert.equal(sources.items[0].favorite, false);
  assert.equal(sources.items[0].pickType, "selection");
  assert.equal(sources.items[0].resourceSummary, "A reference intended for a standalone Sourcebook Pack.");

  await post(`/api/sources/${pick.sourceItemId}/favorite`, { favorite: true }, "PATCH");
  const favorited = await get("/api/sources");
  assert.equal(favorited.items[0].favorite, true);

  await post(`/api/sources/${pick.sourceItemId}/note`, { note: "Use in the next brief." }, "PATCH");
  const updated = await get("/api/sources");
  assert.equal(updated.items[0].userNote, "Use in the next brief.");

  await post(`/api/sources/${pick.sourceItemId}/title`, { title: "Standalone pack reference" }, "PATCH");
  await post(`/api/sources/${pick.sourceItemId}/content`, { contentText: "Updated Picked source content." }, "PATCH");
  const edited = await get("/api/sources");
  assert.equal(edited.items[0].itemTitle, "Standalone pack reference");
  assert.equal(edited.items[0].contentText, "Updated Picked source content.");

  const pack = await post("/api/source-packs", { sourceItemIds: [pick.sourceItemId], prompt: "Use this as context." });
  assert.deepEqual(pack.sourcePack.sourceItemIds, [pick.sourceItemId]);
  const download = await fetch(`${baseUrl}/api/source-packs/${pack.sourcePack.id}/download`);
  assert.equal(download.status, 404);
});

test("Picker writes require an explicit existing Book", async () => {
  const missingBook = await fetch(`${baseUrl}/api/picks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceType: "webpage", modality: "text", pickType: "selection", contentText: "No Book", sourceUrl: "https://example.com/no-book",
    }),
  });
  assert.equal(missingBook.status, 400);
  assert.equal((await missingBook.json()).code, "BOOK_REQUIRED");

  const removedBook = await fetch(`${baseUrl}/api/picks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookId: "removed-book", sourceType: "webpage", modality: "text", pickType: "selection", contentText: "Wrong Book", sourceUrl: "https://example.com/wrong-book",
    }),
  });
  assert.equal(removedBook.status, 404);
  assert.equal((await removedBook.json()).code, "BOOK_NOT_FOUND");
});

test("Conversation Picks deduplicate only matching content from the same source", async () => {
  const payload = {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "conversation",
    pickType: "visible_conversation",
    sourceUrl: "https://chat.example.com/conversation/abc",
    contentUrl: "https://chat.example.com/conversation/abc",
    contentText: "# Example conversation\n\n## 1. user\n\nHello",
    conversation: { provider: "chatgpt", messages: [], messageCount: 1, roleCounts: { user: 1, assistant: 0, system: 0, unknown: 0 } },
  };

  const first = await post("/api/picks", payload);
  const duplicate = await post("/api/picks", payload);
  const changed = await post("/api/picks", { ...payload, contentText: `${payload.contentText}\n\n## 2. assistant\n\nHi` });

  assert.equal(first.status, "saved");
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.sourceItemId, first.sourceItemId);
  assert.equal(changed.status, "saved");
  assert.notEqual(changed.sourceItemId, first.sourceItemId);
});

test("Books isolate picks and transfer keeps the source portable", async () => {
  const created = await post("/api/books", { name: "Brand references" });
  const books = await get("/api/books");
  assert.equal(books.books.length, 2);
  const renamed = await post(`/api/books/${created.book.id}`, { name: "Brand library" }, "PATCH");
  assert.equal(renamed.book.id, created.book.id);
  assert.equal(renamed.book.name, "Brand library");
  assert.equal((await get("/api/books")).books.find((book) => book.id === created.book.id)?.name, "Brand library");

  const pick = await post("/api/picks", {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "text",
    pickType: "selection",
    contentText: "A portable source for the brand book.",
    sourceUrl: "https://example.com/portable",
    sourceTitle: "Portable source",
    sourceOrigin: "https://example.com",
    pickedAt: "2026-10-07T13:00:00.000Z",
  });
  const originItems = await get("/api/sources?bookId=sourcebook");
  const targetBefore = await get(`/api/sources?bookId=${created.book.id}`);
  assert.equal(originItems.items.some((item) => item.id === pick.sourceItemId), true);
  assert.equal(targetBefore.items.length, 0);

  const copied = await post(`/api/books/sourcebook/sources/${pick.sourceItemId}/transfer`, { targetBookId: created.book.id, mode: "copy" });
  assert.equal(copied.mode, "copy");
  assert.equal((await get("/api/sources?bookId=sourcebook")).items.some((item) => item.id === pick.sourceItemId), true);
  assert.equal((await get(`/api/sources?bookId=${created.book.id}`)).items.length, 1);

  await post(`/api/books/${created.book.id}/import`, {
    name: "brief.txt",
    mimeType: "text/plain",
    contentBase64: Buffer.from("Imported as a local Sourcebook copy.").toString("base64"),
  });
  const withImport = await get(`/api/sources?bookId=${created.book.id}`);
  const localText = withImport.items.find((item) => item.itemTitle === "brief");
  assert.equal(localText.assetCacheState, "cached");
  assert.equal(localText.linkState, "none");
  assert.equal(localText.modality, "file");
  const jsonImport = await post(`/api/books/${created.book.id}/import`, {
    name: "brief.json",
    mimeType: "application/json",
    contentBase64: Buffer.from('{"brief":true}').toString("base64"),
  });
  const jsonSource = (await get(`/api/sources?bookId=${created.book.id}`)).items.find((item) => item.id === jsonImport.sourceItemId);
  assert.equal(jsonSource.modality, "file");
  assert.equal(jsonSource.mimeType, "application/json");
  assert.deepEqual(
    withImport.items.map((item) => item.pickedAt),
    [...withImport.items.map((item) => item.pickedAt)].sort((left, right) => right.localeCompare(left)),
  );

  const unsupported = await fetch(`${baseUrl}/api/books/${created.book.id}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "archive.zip", mimeType: "application/zip", contentBase64: Buffer.from("zip").toString("base64") }),
  });
  assert.equal(unsupported.status, 500);
  assert.match((await unsupported.json()).error, /Unsupported format/);

  const disposable = await post("/api/books", { name: "Disposable Book" });
  const deleted = await fetch(`${baseUrl}/api/books/${disposable.book.id}`, { method: "DELETE" });
  assert.equal(deleted.ok, true);
  assert.equal((await deleted.json()).books.some((book) => book.id === disposable.book.id), false);

  const archive = await fetch(`${baseUrl}/api/library/backup`);
  assert.equal(archive.ok, true);
  const backup = Buffer.from(await archive.arrayBuffer()).toString("base64");
  const restored = await post("/api/library/restore", { archive: backup, mode: "append" });
  assert.equal(restored.books.length, 4);
});

test("Image links and managed local copies keep independent states", async () => {
  const pick = await post("/api/picks", {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "image",
    pickType: "image",
    contentUrl: "https://127.0.0.1/not-public.png",
    contentText: "This image content must not be stored.",
    sourceUrl: "https://example.com/image-reference",
    sourceTitle: "Image reference",
    sourceOrigin: "https://example.com",
    pickedAt: "2026-10-07T14:00:00.000Z",
  });
  const before = (await get("/api/sources")).items.find((item) => item.id === pick.sourceItemId);
  assert.equal(before.assetCacheState, "pending");
  assert.equal(before.linkState, "linked");
  assert.equal(before.contentText, null);
  assert.equal(before.itemTitle, "This image cont");

  const started = await post(`/api/sources/${pick.sourceItemId}/download`, {});
  assert.equal(started.status, "downloading");
  const completed = await eventually(async () => (await get("/api/sources")).items.find((item) => item.id === pick.sourceItemId)?.assetCacheState === "failed");
  assert.equal(completed, true);

  const after = (await get("/api/sources")).items.find((item) => item.id === pick.sourceItemId);
  assert.equal(after.assetCacheState, "failed");
  assert.equal(after.linkState, "invalid");
});

test("Video Sources retain a page cover while audio avoids unrelated page artwork", async () => {
  const videoPick = await post("/api/picks", {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "video",
    pickType: "video",
    contentUrl: "https://example.com/trailer.mp4",
    sourceUrl: "https://example.com/trailer",
    sourceTitle: "Trailer page",
    sourceOrigin: "https://example.com",
    pageMetadata: { mediaDurationSeconds: 42, ogImage: "https://example.com/trailer-cover.jpg" },
    pickedAt: "2026-10-07T14:59:00.000Z",
  });
  const video = (await get("/api/sources")).items.find((item) => item.id === videoPick.sourceItemId);
  assert.equal(video.thumbnailUrl, `/api/books/sourcebook/sources/${videoPick.sourceItemId}/preview`);
  assert.equal(video.metadata.mediaPreviewUrl, "https://example.com/trailer-cover.jpg");

  const pick = await post("/api/picks", {
    bookId: "sourcebook",
    sourceType: "webpage",
    modality: "audio",
    pickType: "audio",
    contentUrl: "https://example.com/episode.mp3",
    sourceUrl: "https://example.com/episode",
    sourceTitle: "Episode page",
    sourceOrigin: "https://example.com",
    pageMetadata: { mediaDurationSeconds: 93.4, ogImage: "https://example.com/unrelated.jpg" },
    pickedAt: "2026-10-07T15:00:00.000Z",
  });
  const audio = (await get("/api/sources")).items.find((item) => item.id === pick.sourceItemId);
  assert.equal(audio.modality, "audio");
  assert.equal(audio.thumbnailUrl, "https://example.com/episode.mp3");
  assert.equal(audio.metadata.mediaPreviewUrl, undefined);
  assert.equal(audio.metadata.mediaDurationSeconds, 93.4);
  assert.equal(audio.assetCacheState, "pending");

  await post("/api/books/sourcebook/import", {
    name: "voice-note.mp3",
    mimeType: "audio/mpeg",
    contentBase64: Buffer.from("mock audio bytes").toString("base64"),
  });
  const localAudio = (await get("/api/sources")).items.find((item) => item.itemTitle === "voice-note");
  assert.equal(localAudio.modality, "audio");
  assert.equal(localAudio.assetCacheState, "cached");
  assert.match(localAudio.localPath, /^assets\/voice-note-/);
});

test("Source pages use stable cursors and each Book rejects a 201st source", async () => {
  const { book } = await post("/api/books", { name: "Pagination limit" });
  for (let index = 0; index < 3; index += 1) {
    await post("/api/picks", {
      bookId: book.id,
      sourceType: "manual",
      modality: "text",
      pickType: "manual_create",
      contentText: "Page item " + index,
      sourceUrl: "https://example.com/pages/" + index,
      sourceTitle: "Page item " + index,
      pickedAt: "2026-10-08T00:00:0" + index + ".000Z",
    });
  }
  const first = await get("/api/sources?bookId=" + book.id + "&limit=2");
  assert.equal(first.total, 3);
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const second = await get("/api/sources?bookId=" + book.id + "&limit=2&cursor=" + encodeURIComponent(first.nextCursor));
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 3);

  for (let index = 3; index < 200; index += 1) {
    await post("/api/picks", {
      bookId: book.id,
      sourceType: "manual",
      modality: "text",
      pickType: "manual_create",
      contentText: "Limit item " + index,
      sourceUrl: "https://example.com/limit/" + index,
      sourceTitle: "Limit item " + index,
    });
  }
  const overflow = await fetch(baseUrl + "/api/picks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bookId: book.id, sourceType: "manual", modality: "text", pickType: "manual_create", contentText: "Overflow", sourceUrl: "https://example.com/overflow", sourceTitle: "Overflow" }),
  });
  assert.equal(overflow.status, 409);
  assert.equal((await overflow.json()).code, "BOOK_SOURCE_LIMIT_REACHED");
});

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

async function post(path, value, method = "POST") {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

async function eventually(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}
