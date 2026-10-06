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
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, API_PORT: String(port), SOURCEBOOK_DB_PATH: join(directory, "sourcebook.sqlite"), SOURCEBOOK_EXPORT_DIR: join(directory, "exports") },
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch { /* wait for the local process */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Public workspace API did not start");
});

after(() => service?.kill("SIGTERM"));

test("Pick -> Sources -> Pack works without Canvas records", async () => {
  const capture = await post("/api/capture/picks", {
    sourceType: "webpage",
    modality: "text",
    pickType: "selection",
    contentText: "A reference intended for a standalone Sourcebook Pack.",
    sourceUrl: "https://example.com/reference",
    sourceTitle: "Reference",
    sourceOrigin: "https://example.com",
    capturedAt: "2026-10-07T12:00:00.000Z",
  });
  const sources = await get("/api/inbox/items");
  assert.equal(sources.items.length, 1);
  assert.match(sources.items[0].contentText, /standalone Sourcebook Pack/);

  await post(`/api/inbox/items/${capture.inboxItemId}/note`, { note: "Use in the next brief." }, "PATCH");
  const updated = await get("/api/inbox/items");
  assert.equal(updated.items[0].userNote, "Use in the next brief.");

  const pack = await post("/api/source-packs", { inboxItemIds: [capture.inboxItemId], prompt: "Use this as context." });
  assert.deepEqual(pack.sourcePack.inboxItemIds, [capture.inboxItemId]);
  const download = await fetch(`${baseUrl}/api/source-packs/${pack.sourcePack.id}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/zip");
  assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 2).toString(), "PK");
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
