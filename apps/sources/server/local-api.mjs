import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { downloadImage, imageType, MAX_MEDIA_BYTES, validateImageLink } from "./media.mjs";
import { createLibrary } from "./library.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dbPath = process.env.SOURCEBOOK_DB_PATH ?? join(appRoot, ".local", "sourcebook.sqlite");
const webRoot = process.env.SOURCEBOOK_SOURCES_WEB_DIR ? resolve(process.env.SOURCEBOOK_SOURCES_WEB_DIR) : null;
const port = Number(process.env.API_PORT ?? 4177);
const library = createLibrary({ legacyDbPath: dbPath });
const BOOK_SOURCE_LIMIT = 200;
const SOURCE_PAGE_DEFAULT = 60;
const SOURCE_PAGE_MAX = 200;
const LOCAL_IMPORT_FORMATS = {
  ".jpg": { mimeType: "image/jpeg", modality: "image" }, ".jpeg": { mimeType: "image/jpeg", modality: "image" }, ".png": { mimeType: "image/png", modality: "image" }, ".webp": { mimeType: "image/webp", modality: "image" }, ".gif": { mimeType: "image/gif", modality: "image" },
  ".mp3": { mimeType: "audio/mpeg", modality: "audio" }, ".wav": { mimeType: "audio/wav", modality: "audio" }, ".m4a": { mimeType: "audio/mp4", modality: "audio" }, ".aac": { mimeType: "audio/aac", modality: "audio" }, ".flac": { mimeType: "audio/flac", modality: "audio" }, ".ogg": { mimeType: "audio/ogg", modality: "audio" },
  ".mp4": { mimeType: "video/mp4", modality: "video" }, ".mov": { mimeType: "video/quicktime", modality: "video" }, ".webm": { mimeType: "video/webm", modality: "video" },
  ".pdf": { mimeType: "application/pdf", modality: "file" }, ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", modality: "file" }, ".pptx": { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", modality: "file" }, ".xlsx": { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", modality: "file" }, ".csv": { mimeType: "text/csv", modality: "file" }, ".txt": { mimeType: "text/plain", modality: "file" }, ".md": { mimeType: "text/markdown", modality: "file" }, ".rtf": { mimeType: "application/rtf", modality: "file" }, ".json": { mimeType: "application/json", modality: "file" }, ".html": { mimeType: "text/html", modality: "file" }, ".htm": { mimeType: "text/html", modality: "file" },
};
const LOCAL_IMPORT_FORMAT_LIST = "JPG, PNG, WEBP, GIF, MP3, WAV, M4A, AAC, FLAC, OGG, MP4, MOV, WEBM, PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, RTF, JSON, HTML";

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  try {
    if (!isAllowedOrigin(origin)) return json(response, { error: "Origin not allowed" }, 403);
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    if (request.method === "OPTIONS") return response.writeHead(204).end();
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, { ok: true, app: "sourcebook-for-agents", apiVersion: "3", capabilities: ["picks", "sources", "source-packs", "books", "backup", "picker-auto-sync"], connection: { protocolVersion: 1, origin: url.origin }, library: library.list() });
    if (request.method === "GET" && url.pathname === "/api/books") return json(response, library.list());
    if (request.method === "POST" && url.pathname === "/api/books") { const value = await body(request); return json(response, { book: library.create(value.name) }, 201); }
    const renameBook = url.pathname.match(/^\/api\/books\/([\w-]+)$/);
    if (request.method === "PATCH" && renameBook) return json(response, { book: library.rename(renameBook[1], (await body(request)).name) });
    const removeBook = url.pathname.match(/^\/api\/books\/([\w-]+)$/);
    if (request.method === "DELETE" && removeBook) return json(response, library.remove(removeBook[1]));
    const activateBook = url.pathname.match(/^\/api\/books\/([\w-]+)\/activate$/);
    if (request.method === "POST" && activateBook) return json(response, library.setActive(activateBook[1]));
    const importFile = url.pathname.match(/^\/api\/books\/([\w-]+)\/import$/);
    if (request.method === "POST" && importFile) return json(response, importLocalFile(context(importFile[1]), await body(request)), 201);
    if (request.method === "GET" && url.pathname === "/api/library/backup") return backup(response);
    if (request.method === "POST" && url.pathname === "/api/library/restore") { const value = await body(request); return json(response, library.restore(Buffer.from(value.archive, "base64"), String(value.mode))); }
    if (request.method === "POST" && url.pathname === "/api/library/migrate") return json(response, library.migrate((await body(request)).destination));
    if (request.method === "POST" && url.pathname === "/api/picks") { const value = await body(request), ctx = context(value.bookId, { required: true }); return json(response, await savePick(ctx, value), 201); }
    if (request.method === "GET" && url.pathname === "/api/sources") return json(response, sourceItems(context(url.searchParams.get("bookId")), { limit: url.searchParams.get("limit"), cursor: url.searchParams.get("cursor") }));
    if (request.method === "POST" && url.pathname === "/api/sources") { const value = await body(request); return json(response, await createSource(context(value.bookId), value), 201); }
    const note = url.pathname.match(/^\/api\/sources\/([\w-]+)\/note$/);
    if (request.method === "PATCH" && note) return json(response, updateNote(context(url.searchParams.get("bookId")), note[1], await body(request)));
    const title = url.pathname.match(/^\/api\/sources\/([\w-]+)\/title$/);
    if (request.method === "PATCH" && title) return json(response, updateTitle(context(url.searchParams.get("bookId")), title[1], await body(request)));
    const content = url.pathname.match(/^\/api\/sources\/([\w-]+)\/content$/);
    if (request.method === "PATCH" && content) return json(response, updateContent(context(url.searchParams.get("bookId")), content[1], await body(request)));
    const favorite = url.pathname.match(/^\/api\/sources\/([\w-]+)\/favorite$/);
    if (request.method === "PATCH" && favorite) return json(response, updateFavorite(context(url.searchParams.get("bookId")), favorite[1], await body(request)));
    const download = url.pathname.match(/^\/api\/sources\/([\w-]+)\/download$/);
    if (request.method === "POST" && download) return json(response, startImageDownload(context(url.searchParams.get("bookId")), download[1]), 202);
    const retryDownload = url.pathname.match(/^\/api\/sources\/([\w-]+)\/retry-download$/);
    if (request.method === "POST" && retryDownload) return json(response, startImageDownload(context(url.searchParams.get("bookId")), retryDownload[1]), 202);
    const validateLink = url.pathname.match(/^\/api\/sources\/([\w-]+)\/validate-link$/);
    if (request.method === "POST" && validateLink) return json(response, await validateSourceLink(context(url.searchParams.get("bookId")), validateLink[1]));
    const revealLocal = url.pathname.match(/^\/api\/sources\/([\w-]+)\/reveal-local$/);
    if (request.method === "POST" && revealLocal) return json(response, revealLocalFile(context(url.searchParams.get("bookId")), revealLocal[1]));
    const openLocal = url.pathname.match(/^\/api\/sources\/([\w-]+)\/open-local$/);
    if (request.method === "POST" && openLocal) return json(response, openLocalFile(context(url.searchParams.get("bookId")), openLocal[1]));
    const copyTextFile = url.pathname.match(/^\/api\/sources\/([\w-]+)\/copy-text-file$/);
    if (request.method === "POST" && copyTextFile) return json(response, await copyTextSourceAsFile(context(url.searchParams.get("bookId")), copyTextFile[1]));
    if (request.method === "DELETE" && url.pathname === "/api/sources") return json(response, removeItems(context(url.searchParams.get("bookId")), (await body(request)).sourceItemIds));
    if (request.method === "POST" && url.pathname === "/api/source-packs/copy-materials") return json(response, await copyPackMaterials(context(url.searchParams.get("bookId")), await body(request)));
    if (request.method === "GET" && url.pathname === "/api/source-packs") { const ctx = context(url.searchParams.get("bookId")); return json(response, { packs: ctx.db.prepare("SELECT id, name, prompt, created_at AS createdAt FROM source_packs ORDER BY created_at DESC LIMIT 50").all() }); }
    if (request.method === "POST" && url.pathname === "/api/source-packs") return json(response, { sourcePack: createPack(context(url.searchParams.get("bookId")), await body(request)) }, 201);
    const transfer = url.pathname.match(/^\/api\/books\/([\w-]+)\/sources\/([\w-]+)\/transfer$/);
    if (request.method === "POST" && transfer) return json(response, transferSource(context(transfer[1]), transfer[2], await body(request)));
    const preview = url.pathname.match(/^\/api\/books\/([\w-]+)\/sources\/([\w-]+)\/preview$/);
    if (request.method === "GET" && preview) return proxyVideoPreview(response, context(preview[1]), preview[2]);
    const media = url.pathname.match(/^\/api\/books\/([\w-]+)\/media\/([\w-]+)$/) || url.pathname.match(/^\/api\/media\/([\w-]+)$/);
    if (request.method === "GET" && media) return file(response, context(media[2] ? media[1] : url.searchParams.get("bookId")), media[2] || media[1]);
    if (request.method === "GET" && webRoot) return website(response, url.pathname);
    return json(response, { error: "Not found" }, 404);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
    return json(response, { error: error instanceof Error ? error.message : "Unknown error", code }, status);
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Sourcebook local API ready at http://127.0.0.1:${port}`));

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function context(bookId, { required = false } = {}) {
  if (required && !bookId) throw new ApiError(400, "BOOK_REQUIRED", "请选择保存到哪个 Book。");
  try {
    return library.context(bookId || library.list().activeBookId);
  } catch (error) {
    if (error instanceof Error && /Book 不存在/.test(error.message)) throw new ApiError(404, "BOOK_NOT_FOUND", error.message);
    throw error;
  }
}

async function createSource(ctx, value) {
  if (!value || typeof value !== "object") throw new Error("Invalid Source payload");
  if (value.file?.contentBase64) {
    const created = importLocalFile(ctx, value.file);
    return applySourceCustomizations(ctx, created, value);
  }
  const modality = String(value.modality ?? "text") === "page" ? "link" : String(value.modality ?? "text");
  if (!["text", "image", "video", "audio", "file", "link", "conversation"].includes(modality)) throw new Error("Unsupported Source modality");
  const sourceUrl = String(value.sourceUrl ?? "sourcebook://manual/" + crypto.randomUUID());
  const payload = {
    sourceType: "manual",
    modality,
    pickType: String(value.pickType ?? "manual_create"),
    sourceUrl,
    sourceTitle: String(value.sourceTitle ?? value.sourceLabel ?? "Manual Source"),
    sourceLabel: value.sourceLabel,
    title: value.title,
    contentText: value.contentText,
    contentUrl: value.contentUrl,
    thumbnailUrl: value.thumbnailUrl,
    contentBase64: value.contentBase64,
    faviconUrl: value.faviconUrl,
    pageMetadata: objectValue(value.pageMetadata),
    metadata: objectValue(value.metadata),
    conversation: value.conversation,
    pickedAt: value.pickedAt,
    userNote: value.note ?? value.userNote,
    favorite: value.favorite,
  };
  return savePick(ctx, payload);
}

function applySourceCustomizations(ctx, created, value) {
  const { db } = ctx;
  if (value.title) updateTitle(ctx, created.sourceItemId, { title: value.title });
  if (value.note ?? value.userNote) updateNote(ctx, created.sourceItemId, { note: value.note ?? value.userNote });
  if (typeof value.favorite === "boolean") updateFavorite(ctx, created.sourceItemId, { favorite: value.favorite });
  const row = db.prepare("SELECT source_id AS sourceId FROM source_items WHERE id=?").get(created.sourceItemId);
  if (row && (value.sourceUrl || value.sourceLabel || value.pickedAt)) db.prepare("UPDATE sources SET url=?,label=?,picked_at=? WHERE id=?").run(String(value.sourceUrl ?? "sourcebook://local/" + created.sourceItemId), String(value.sourceLabel ?? "Local file"), String(value.pickedAt ?? new Date().toISOString()), row.sourceId);
  if (value.metadata && typeof value.metadata === "object") db.prepare("UPDATE picks SET metadata_json=? WHERE source_item_id=?").run(JSON.stringify(objectValue(value.metadata)), created.sourceItemId);
  return created;
}
async function savePick(ctx, payload) {
  const { db } = ctx;
  if (payload?.modality === "page") payload = { ...payload, modality: "link" };
  if (!payload || !["text", "image", "video", "audio", "file", "link", "conversation"].includes(payload.modality) || !payload.sourceUrl || !payload.pickType) throw new Error("Invalid Pick payload");
  const normalizedText = String(payload.contentText ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const identity =
    payload.modality === "link"
      ? payload.pageMetadata?.canonicalUrl || payload.contentUrl || payload.sourceUrl
      : payload.modality === "conversation"
        ? `${payload.sourceUrl}\n${normalizedText}`
        : payload.contentUrl || normalizedText || payload.sourceUrl;
  const hash = createHash("sha256").update(`${payload.modality}\n${identity}`).digest("hex");
  const existing = db.prepare("SELECT id FROM resources WHERE content_hash=?").get(hash);
  if (payload.modality === "conversation" && existing) {
    const duplicate = db.prepare(`
      SELECT source_items.id AS sourceItemId, picks.id AS pickId
      FROM picks
      JOIN source_items ON source_items.id = picks.source_item_id
      JOIN sources ON sources.id = source_items.source_id
      WHERE picks.resource_id = ? AND picks.modality = 'conversation' AND sources.url = ?
      ORDER BY picks.picked_at DESC
      LIMIT 1
    `).get(existing.id, payload.sourceUrl);
    if (duplicate) return { ...duplicate, resourceId: existing.id, status: "duplicate" };
  }
  ensureBookCapacity(ctx);
  const suffix = crypto.randomUUID().slice(0, 8), sourceId = `source-${suffix}`, resourceId = existing?.id ?? `resource-${suffix}`, sourceItemId = `source-item-${suffix}`, pickId = `pick-${suffix}`;
  const pickedAt = String(payload.pickedAt ?? new Date().toISOString()), title = titleFor(payload);
  // Video pages commonly expose their cover as Open Graph metadata. Audio must not
  // inherit it because the page image is rarely an audio-specific cover.
  const pageMetadata = objectValue(payload.pageMetadata);
  const mediaPreviewUrl = payload.modality === "video" ? externalUrl(payload.thumbnailUrl) ?? externalUrl(pageMetadata.ogImage) : null;
  const metadata = { ...objectValue(payload.metadata), ...pageMetadata, faviconUrl: payload.faviconUrl, conversation: payload.conversation, ...(mediaPreviewUrl ? { mediaPreviewUrl } : {}) };
  transaction(db, () => {
    db.prepare("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)").run(sourceId, String(payload.sourceLabel ?? host(payload.sourceUrl)), payload.sourceUrl, pickedAt);
    if (!existing) {
      db.prepare("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)").run(resourceId, kindFor(payload.modality), sourceId, title, summaryFor(payload), hash, pickedAt);
      if (payload.contentText && !["link", "image", "video"].includes(payload.modality)) db.prepare("INSERT INTO text_contents (resource_id,text) VALUES (?,?)").run(resourceId, String(payload.contentText));
      const mediaUrl = payload.contentUrl ?? payload.thumbnailUrl ?? (payload.contentBase64 ? payload.sourceUrl : undefined);
      if ((payload.modality === "image" || payload.modality === "video" || payload.modality === "audio") && mediaUrl) addAsset(ctx, resourceId, suffix, title, payload, mediaUrl);
    }
    db.prepare("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)").run(sourceItemId, resourceId, sourceId, title, String(payload.userNote ?? ""), "available", pickedAt);
    if (typeof payload.favorite === "boolean") db.prepare("UPDATE resources SET favorite=? WHERE id=?").run(payload.favorite ? 1 : 0, resourceId);
    db.prepare("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)").run(pickId, resourceId, sourceId, sourceItemId, payload.modality, payload.pickType, JSON.stringify(metadata), pickedAt);
  });
  return { sourceItemId, resourceId, pickId, status: existing ? "duplicate" : "saved", cacheState: payload.modality === "image" ? payload.contentBase64 ? "cached" : "pending" : undefined };
}

function addAsset(ctx, resourceId, suffix, title, payload, originalUrl) {
  const { db, mediaRoot, book } = ctx;
  const id = `asset-${suffix}`;
  if (payload.modality === "image" && payload.contentBase64) {
    const bytes = Buffer.from(payload.contentBase64, "base64"); if (bytes.length > MAX_MEDIA_BYTES) throw new Error("图片超过 20 MB");
    const type = imageType(bytes), fileName = safeName(title, type.ext, id); writeFileSync(join(mediaRoot, fileName), bytes);
    return db.prepare("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)").run(id, resourceId, type.mime, originalUrl, `/api/books/${book.id}/media/${id}`, "cached", fileName, originalUrl ? "linked" : "none");
  }
  const mimeType = payload.modality === "image" ? "image/*" : payload.modality === "audio" ? "audio/*" : "video/*";
  db.prepare("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)").run(id, resourceId, mimeType, originalUrl, originalUrl, "pending", null, originalUrl ? "linked" : "none");
}

function importLocalFile(ctx, value) {
  const { db, mediaRoot, book } = ctx;
  const name = basename(String(value.name ?? "")).slice(0, 180);
  const format = localImportFormat(name);
  const bytes = Buffer.from(String(value.contentBase64 ?? ""), "base64");
  if (!name || !bytes.length) throw new Error("请选择有效的本地文件");
  if (!format) throw new Error(`Unsupported format. Supported: ${LOCAL_IMPORT_FORMAT_LIST}.`);
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("单个文件暂不支持超过 20 MB");
  ensureBookCapacity(ctx);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const existing = db.prepare("SELECT id FROM resources WHERE content_hash=?").get(hash);
  const suffix = crypto.randomUUID().slice(0, 8), sourceId = `source-${suffix}`, resourceId = existing?.id ?? `resource-${suffix}`, sourceItemId = `source-item-${suffix}`, pickId = `pick-${suffix}`, pickedAt = new Date().toISOString(), { mimeType, modality } = format;
  const title = name.replace(extname(name), "") || name;
  transaction(db, () => {
    db.prepare("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)").run(sourceId, "Local file", `sourcebook://local/${encodeURIComponent(name)}`, pickedAt);
    if (!existing) {
      db.prepare("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at) VALUES (?,?,?,?,?,?,?)").run(resourceId, "file", sourceId, title, "", hash, pickedAt);
      const assetId = `asset-${suffix}`, fileName = safeName(title, extname(name) || ".bin", assetId);
      writeFileSync(join(mediaRoot, fileName), bytes);
      db.prepare("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)").run(assetId, resourceId, mimeType, null, `/api/books/${book.id}/media/${assetId}`, "cached", fileName, "none");
    }
    db.prepare("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)").run(sourceItemId, resourceId, sourceId, title, "", "available", pickedAt);
    db.prepare("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)").run(pickId, resourceId, sourceId, sourceItemId, modality, "local_import", "{}", pickedAt);
  });
  return { sourceItemId, resourceId, pickId, status: existing ? "duplicate" : "saved" };
}

function localImportFormat(name) { return LOCAL_IMPORT_FORMATS[extname(name).toLowerCase()] ?? null; }

async function cacheImage(ctx, resourceId) {
  const { db, mediaRoot, book } = ctx;
  const asset = db.prepare("SELECT assets.*,resources.title FROM assets JOIN resources ON resources.id=assets.resource_id WHERE assets.resource_id=?").get(resourceId); if (!asset) return;
  try { const image = await downloadImage(asset.original_url), fileName = safeName(asset.title, image.ext, asset.id); writeFileSync(join(mediaRoot, fileName), image.bytes); db.prepare("UPDATE assets SET mime_type=?,file_uri=?,cache_state='cached',file_name=? WHERE id=?").run(image.mime, `/api/books/${book.id}/media/${asset.id}`, fileName, asset.id); db.prepare("UPDATE source_items SET storage_state='available' WHERE resource_id=?").run(resourceId); return { status: "saved" }; }
  catch (error) { const message = error instanceof Error ? error.message : "Image download failed"; const linkState = isDefinitiveLinkFailure(message) ? "invalid" : asset.link_state; db.prepare("UPDATE assets SET cache_state='failed',file_uri=?,link_state=? WHERE id=?").run(asset.original_url, linkState, asset.id); db.prepare("UPDATE source_items SET storage_state='failed' WHERE resource_id=?").run(resourceId); return { status: "failed", error: message }; }
}

function isDefinitiveLinkFailure(message) {
  return /图片下载失败（(?:404|410)）|图片需要公开的 HTTPS 地址|不支持内部网络图片地址/.test(message);
}

function startImageDownload(ctx, sourceItemId) {
  const { db } = ctx;
  const row = db.prepare("SELECT source_items.resource_id AS resourceId, picks.modality, assets.original_url AS originalUrl, assets.cache_state AS cacheState FROM source_items JOIN picks ON picks.source_item_id=source_items.id LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?").get(sourceItemId);
  if (!row) throw new Error("素材不存在");
  if (row.modality !== "image" || !row.originalUrl) throw new Error("此素材没有可重新下载的图片链接");
  if (row.cacheState === "downloading") return { status: "downloading" };
  db.prepare("UPDATE assets SET cache_state='downloading',file_uri=? WHERE resource_id=?").run(row.originalUrl, row.resourceId);
  db.prepare("UPDATE source_items SET storage_state='downloading' WHERE resource_id=?").run(row.resourceId);
  void cacheImage(ctx, row.resourceId);
  return { status: "downloading" };
}

async function validateSourceLink(ctx, sourceItemId) {
  const { db } = ctx;
  const row = db.prepare("SELECT assets.id AS assetId,assets.original_url AS originalUrl FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?").get(sourceItemId);
  if (!row?.originalUrl) throw new Error("此素材没有可检查的来源链接");
  const result = await validateImageLink(row.originalUrl);
  if (result.state === "invalid") db.prepare("UPDATE assets SET link_state='invalid' WHERE id=?").run(row.assetId);
  else if (result.state === "linked") db.prepare("UPDATE assets SET link_state='linked' WHERE id=?").run(row.assetId);
  return result;
}

function sourceItems(ctx, { limit, cursor } = {}) {
  const { db, mediaRoot, book } = ctx;
  const pageLimit = Math.max(1, Math.min(SOURCE_PAGE_MAX, Number.parseInt(String(limit ?? SOURCE_PAGE_DEFAULT), 10) || SOURCE_PAGE_DEFAULT));
  const after = decodeSourceCursor(cursor);
  const clause = after ? "WHERE (source_items.created_at < ? OR (source_items.created_at = ? AND source_items.id < ?))" : "";
  const bindings = after ? [after.createdAt, after.createdAt, after.id, pageLimit + 1] : [pageLimit + 1];
  const sql = "SELECT source_items.id,source_items.resource_id AS resourceId,source_items.title AS itemTitle,source_items.note AS userNote,source_items.storage_state AS status,source_items.created_at AS pickedAt,resources.favorite AS favorite,resources.summary AS resourceSummary,picks.modality,picks.pick_type AS pickType,picks.metadata_json AS metadataJson,text_contents.text AS contentText,assets.id AS assetId,assets.mime_type AS mimeType,assets.original_url AS contentUrl,assets.file_uri AS thumbnailUrl,assets.cache_state AS assetCacheState,assets.link_state AS linkState,assets.file_name AS fileName,sources.url AS sourceUrl,sources.label AS sourceTitle FROM source_items JOIN resources ON resources.id=source_items.resource_id JOIN picks ON picks.source_item_id=source_items.id JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id LEFT JOIN assets ON assets.resource_id=source_items.resource_id " + clause + " ORDER BY source_items.created_at DESC,source_items.id DESC LIMIT ?";
  const rows = db.prepare(sql).all(...bindings);
  const hasMore = rows.length > pageLimit;
  const pageRows = hasMore ? rows.slice(0, pageLimit) : rows;
  const items = pageRows.map((row) => {
    const metadata = parse(row.metadataJson);
    const localPath = row.fileName ? join(mediaRoot, row.fileName) : null;
    const localFileExists = Boolean(localPath && existsSync(localPath));
    const fileSize = localFileExists ? statSync(localPath).size : null;
    const assetCacheState = row.assetCacheState === "cached" && !localFileExists ? "missing" : row.assetCacheState;
    const isManagedLocalFile = row.pickType === "local_import" || row.fileName && row.sourceUrl.startsWith("sourcebook://local/");
    const modality = isManagedLocalFile && !["image", "video", "audio"].includes(row.modality) ? "file" : row.modality;
    const mediaPreviewUrl = modality === "video" ? externalUrl(metadata.mediaPreviewUrl) ?? externalUrl(metadata.videoPreviewUrl) ?? externalUrl(metadata.ogImage) : null;
    if (mediaPreviewUrl) metadata.mediaPreviewUrl = mediaPreviewUrl;
    if (modality === "link") delete metadata.ogImage;
    const thumbnailUrl = modality === "link" ? null : mediaPreviewUrl ? `/api/books/${book.id}/sources/${row.id}/preview` : (assetCacheState === "missing" || assetCacheState === "failed" || assetCacheState === "pending" || assetCacheState === "downloading" ? row.contentUrl || row.thumbnailUrl : row.thumbnailUrl);
    const linkState = row.assetId ? (row.linkState ?? (row.contentUrl ? "linked" : "none")) : /^https?:\/\//.test(row.sourceUrl) ? "linked" : "none";
    return { ...row, modality, bookId: book.id, assetCacheState, linkState, favorite: Boolean(row.favorite), contentText: ["link", "image", "video"].includes(modality) ? null : row.contentText, sourceOrigin: originOf(row.sourceUrl), faviconUrl: metadata.faviconUrl ?? null, thumbnailUrl, localPath: row.fileName ? "assets/" + row.fileName : null, fileSize, metadata };
  });
  const last = pageRows.at(-1);
  return { items, total: Number(db.prepare("SELECT COUNT(*) AS count FROM source_items").get().count), nextCursor: hasMore && last ? encodeSourceCursor(last) : null, limit: pageLimit };
}

function ensureBookCapacity(ctx, incoming = 1) {
  const count = Number(ctx.db.prepare("SELECT COUNT(*) AS count FROM source_items").get().count);
  if (count + incoming > BOOK_SOURCE_LIMIT) throw new ApiError(409, "BOOK_SOURCE_LIMIT_REACHED", "This Book can contain up to " + BOOK_SOURCE_LIMIT + " sources.");
}

function decodeSourceCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") throw new Error("Invalid cursor");
    return parsed;
  } catch { throw new ApiError(400, "INVALID_SOURCE_CURSOR", "Invalid source page cursor."); }
}

function encodeSourceCursor(row) { return Buffer.from(JSON.stringify({ createdAt: row.pickedAt, id: row.id })).toString("base64url"); }
function revealLocalFile(ctx, sourceItemId) {
  const { db, mediaRoot } = ctx;
  const row = db.prepare("SELECT assets.file_name AS fileName FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?").get(sourceItemId);
  if (!row?.fileName) throw new Error("此素材没有本地文件");
  const filePath = join(mediaRoot, row.fileName);
  if (!existsSync(filePath)) throw new Error("本地文件不存在");
  const command = process.platform === "darwin" ? ["open", ["-R", filePath]] : process.platform === "win32" ? ["explorer.exe", ["/select,", filePath]] : ["xdg-open", [dirname(filePath)]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, localPath: `assets/${row.fileName}` };
}

function openLocalFile(ctx, sourceItemId) {
  const { db, mediaRoot } = ctx;
  const row = db.prepare("SELECT assets.file_name AS fileName FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?").get(sourceItemId);
  if (!row?.fileName) throw new Error("此素材没有本地文件");
  const filePath = join(mediaRoot, row.fileName);
  if (!existsSync(filePath)) throw new Error("本地文件不存在");
  const command = process.platform === "darwin" ? ["open", [filePath]] : process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", filePath]] : ["xdg-open", [filePath]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return { ok: true, localPath: `assets/${row.fileName}` };
}

async function copyTextSourceAsFile(ctx, sourceItemId) {
  const { db } = ctx;
  const row = db.prepare("SELECT source_items.id AS id,source_items.title AS title,text_contents.text AS contentText,picks.modality AS modality FROM source_items JOIN picks ON picks.source_item_id=source_items.id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id WHERE source_items.id=?").get(sourceItemId);
  if (!row) throw new Error("素材不存在");
  if (!["text", "conversation"].includes(row.modality)) throw new ApiError(400, "TEXT_FILE_ONLY", "只有 Text 和 Chat 可以复制为文本文件。");
  if (row.contentText === null) throw new ApiError(400, "TEXT_UNAVAILABLE", "此素材没有可复制的文本内容。");
  const clipboardRoot = join(tmpdir(), "sourcebook-clipboard");
  mkdirSync(clipboardRoot, { recursive: true });
  const fileName = safeName(row.title, ".txt", row.id);
  const filePath = join(clipboardRoot, fileName);
  writeFileSync(filePath, row.contentText, "utf8");
  await copyFileToSystemClipboard(filePath);
  return { ok: true, fileName };
}

async function copyPackMaterials(ctx, bodyValue) {
  const ids = Array.isArray(bodyValue.sourceItemIds) ? [...new Set(bodyValue.sourceItemIds.map(String).filter(Boolean))] : [];
  if (!ids.length) throw new ApiError(400, "EMPTY_PACK", "请至少选择一个素材");
  const marks = ids.map(() => "?").join(",");
  const rows = ctx.db.prepare(`SELECT source_items.id AS sourceItemId,source_items.title AS title,source_items.note AS note,sources.url AS sourceUrl,text_contents.text AS contentText,assets.file_name AS fileName,assets.cache_state AS cacheState,picks.modality AS modality FROM source_items JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=source_items.resource_id LEFT JOIN assets ON assets.resource_id=source_items.resource_id LEFT JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id IN (${marks})`).all(...ids);
  if (rows.length !== ids.length) throw new Error("部分素材不存在或已删除");

  const clipboardRoot = join(tmpdir(), "sourcebook-clipboard", "packs");
  mkdirSync(clipboardRoot, { recursive: true });
  const filePaths = [];
  const linkReferences = [];
  let skipped = 0;

  for (const row of rows) {
    const localPath = row.fileName && row.cacheState === "cached" ? join(ctx.mediaRoot, row.fileName) : null;
    if (localPath && existsSync(localPath)) {
      filePaths.push(localPath);
      continue;
    }
    if (["text", "conversation"].includes(row.modality) && typeof row.contentText === "string" && row.contentText.trim()) {
      const filePath = join(clipboardRoot, safeName(row.title, ".txt", row.sourceItemId));
      writeFileSync(filePath, row.contentText, "utf8");
      filePaths.push(filePath);
      continue;
    }
    const sourceUrl = String(row.sourceUrl ?? "").trim();
    if (/^https?:\/\//i.test(sourceUrl)) {
      linkReferences.push({ title: row.title, note: row.note, url: sourceUrl });
    }
    skipped += 1;
  }

  if (!filePaths.length) throw new ApiError(400, "NO_COPYABLE_MATERIAL", "所选素材没有可复制的文件。没有本地副本的素材会在复制提示词时以链接提供。");
  await copyFilesToSystemClipboard(filePaths);
  return { ok: true, copied: filePaths.length, skipped, linkReferences: linkReferences.length };
}

async function copyFileToSystemClipboard(filePath) {
  return copyFilesToSystemClipboard([filePath]);
}

async function copyFilesToSystemClipboard(filePaths) {
  if (process.platform === "darwin") {
    const script = `ObjC.import("AppKit");
const paths = ${JSON.stringify(filePaths)};
const pasteboard = $.NSPasteboard.generalPasteboard;
pasteboard.clearContents;
const urls = $.NSMutableArray.array;
paths.forEach((path) => urls.addObject($.NSURL.fileURLWithPath($(path))));
if (!pasteboard.writeObjects(urls)) throw new Error("Unable to write files to the clipboard.");`;
    await runCommand("osascript", ["-l", "JavaScript", "-e", script]);
    return;
  }
  if (process.platform === "win32") {
    const escapedPaths = filePaths.map((filePath) => `[void]$files.Add('${filePath.replaceAll("'", "''")}');`).join(" ");
    const script = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; $files = New-Object System.Collections.Specialized.StringCollection; ${escapedPaths} [System.Windows.Forms.Clipboard]::SetFileDropList($files); if (-not [System.Windows.Forms.Clipboard]::ContainsFileDropList()) { throw 'Unable to write files to the clipboard.' }`;
    await runCommand("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
    return;
  }
  throw new ApiError(501, "FILE_CLIPBOARD_UNSUPPORTED", "当前系统暂不支持复制文本文件。请使用 macOS 或 Windows 桌面版。");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (value) => { error += String(value); });
    child.on("error", (cause) => reject(new Error(`无法访问系统剪贴板：${cause.message}`)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || "无法复制文本文件到系统剪贴板。")));
  });
}

function updateNote(ctx, id, value) { const { db } = ctx; const note = String(value.note ?? "").trim(); const result = db.prepare("UPDATE source_items SET note=? WHERE id=?").run(note, id); if (!result.changes) throw new Error("素材不存在"); return { ok: true }; }
function updateTitle(ctx, id, value) { const { db, mediaRoot } = ctx; const title = String(value.title ?? "").trim().replace(/\s+/g, " ").slice(0, 160); if (!title) throw new Error("标题不能为空"); const row = db.prepare("SELECT source_items.resource_id AS resourceId, assets.file_name AS fileName FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id=?").get(id); if (!row) throw new Error("素材不存在"); db.prepare("UPDATE source_items SET title=? WHERE id=?").run(title, id); db.prepare("UPDATE resources SET title=? WHERE id=?").run(title, row.resourceId); if (row.fileName && existsSync(join(mediaRoot, row.fileName))) { const extension = extname(row.fileName); const nextName = safeName(title, extension, row.fileName); if (nextName !== row.fileName) { renameSync(join(mediaRoot, row.fileName), join(mediaRoot, nextName)); db.prepare("UPDATE assets SET file_name=? WHERE resource_id=?").run(nextName, row.resourceId); } } return { ok: true, title }; }
function updateContent(ctx, id, value) { const { db } = ctx; const text = String(value.contentText ?? "").trim(); const resource = db.prepare("SELECT source_items.resource_id AS resourceId,picks.modality FROM source_items JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id=?").get(id); if (!resource) throw new Error("素材不存在"); if (["image", "video"].includes(resource.modality)) throw new Error("图片和视频不支持正文内容"); const result = db.prepare("UPDATE text_contents SET text=? WHERE resource_id=?").run(text, resource.resourceId); if (!result.changes) throw new Error("此素材不包含可编辑文字"); db.prepare("UPDATE resources SET summary=? WHERE id=?").run(text.replace(/\s+/g, " ").slice(0, 240), resource.resourceId); return { ok: true, contentText: text }; }
function updateFavorite(ctx, id, value) { const { db } = ctx; const favorite = value.favorite ? 1 : 0; const result = db.prepare("UPDATE resources SET favorite=? WHERE id=(SELECT resource_id FROM source_items WHERE id=?)").run(favorite, id); if (!result.changes) throw new Error("素材不存在"); return { ok: true, favorite: Boolean(favorite) }; }
function removeItems(ctx, values) { const { db, mediaRoot } = ctx; const ids = Array.isArray(values) ? [...new Set(values.map(String).filter(Boolean))] : []; if (!ids.length) throw new Error("请选择要删除的素材"); const marks = ids.map(() => "?").join(","), rows = db.prepare(`SELECT source_items.resource_id AS resourceId,assets.file_name AS fileName FROM source_items LEFT JOIN assets ON assets.resource_id=source_items.resource_id WHERE source_items.id IN (${marks})`).all(...ids); const files = []; transaction(db, () => { db.prepare(`DELETE FROM source_items WHERE id IN (${marks})`).run(...ids); for (const resourceId of [...new Set(rows.map(row => row.resourceId))]) if (!db.prepare("SELECT COUNT(*) AS count FROM source_items WHERE resource_id=?").get(resourceId).count) { rows.filter((row) => row.resourceId === resourceId && row.fileName).forEach((row) => files.push(row.fileName)); db.prepare("DELETE FROM resources WHERE id=?").run(resourceId); } }); for (const fileName of [...new Set(files)]) moveToTrash(join(mediaRoot, fileName)); return { ok: true, deletedCount: rows.length }; }

function createPack(ctx, bodyValue) { const { db } = ctx; const ids = Array.isArray(bodyValue.sourceItemIds) ? [...new Set(bodyValue.sourceItemIds.map(String).filter(Boolean))] : []; if (!ids.length) throw new Error("请至少选择一个素材"); const marks = ids.map(() => "?").join(","), rows = db.prepare(`SELECT source_items.id AS sourceItemId,source_items.title,source_items.note,resources.summary,sources.url AS sourceUrl,sources.label AS sourceLabel,text_contents.text,assets.id AS assetId,assets.file_name AS fileName,assets.cache_state AS cacheState,picks.modality FROM source_items JOIN resources ON resources.id=source_items.resource_id JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=resources.id LEFT JOIN assets ON assets.resource_id=resources.id LEFT JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id IN (${marks}) ORDER BY source_items.created_at DESC`).all(...ids); if (rows.length !== ids.length) throw new Error("部分素材不存在或已删除"); const id = `source-pack-${crypto.randomUUID().slice(0,8)}`, prompt = String(bodyValue.prompt ?? "请使用附带的素材作为上下文完成任务。").trim(), warnings=[]; rows.forEach((row) => { if (row.assetId && row.cacheState !== "cached") warnings.push(`素材“${row.title}”没有本地副本，打包时仅保留链接。`); }); const createdAt=new Date().toISOString(),name=String(bodyValue.name??"Sourcebook Pack");transaction(db,()=>{db.prepare("INSERT INTO source_packs VALUES (?,?,?,?,?)").run(id,name,prompt,"",createdAt);const item=db.prepare("INSERT INTO source_pack_items VALUES (?,?)");ids.forEach(value=>item.run(id,value))});return {id,name,prompt,sourceItemIds:ids,createdAt,warnings}; }
async function proxyVideoPreview(response, ctx, sourceItemId) {
  const row = ctx.db.prepare("SELECT sources.url AS sourceUrl,picks.modality,picks.metadata_json AS metadataJson FROM source_items JOIN sources ON sources.id=source_items.source_id JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id=?").get(sourceItemId);
  const metadata = parse(row?.metadataJson);
  const previewUrl = securePreviewUrl(row?.modality === "video" ? metadata.mediaPreviewUrl ?? metadata.videoPreviewUrl ?? metadata.ogImage : null);
  if (!previewUrl) return json(response, { error: "视频封面不可用" }, 404);
  try {
    const image = await downloadImage(previewUrl, { referer: sourceReferer(row.sourceUrl) });
    response.writeHead(200, { "content-type": image.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" });
    response.end(image.bytes);
  } catch (error) {
    return json(response, { error: error instanceof Error ? error.message : "视频封面不可用" }, 502);
  }
}
function securePreviewUrl(value) { try { const url = new URL(String(value ?? "")); if (url.protocol === "http:") url.protocol = "https:"; return url.protocol === "https:" ? url.href : null; } catch { return null; } }
function sourceReferer(value) { try { const url = new URL(value); return /^https:$/.test(url.protocol) ? url.origin + "/" : undefined; } catch { return undefined; } }
function file(response, ctx, id){const { db, mediaRoot }=ctx, asset=db.prepare("SELECT * FROM assets WHERE id=?").get(id),path=asset?.file_name?join(mediaRoot,asset.file_name):null;if(!path||!existsSync(path))return json(response,{error:"文件不可用"},404);response.writeHead(200,{"content-type":asset.mime_type,"x-content-type-options":"nosniff"});response.end(readFileSync(path));}
function website(response,path){const requestPath=decodeURIComponent(path),candidate=resolve(webRoot,requestPath==="/"?"index.html":requestPath.replace(/^\/+/,"")),filePath=candidate.startsWith(`${webRoot}/`)&&existsSync(candidate)?candidate:join(webRoot,"index.html");if(!existsSync(filePath))return json(response,{error:"Sourcebook Sources build is missing"},503);const type={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"}[extname(filePath)]??"application/octet-stream";response.writeHead(200,{"content-type":type,"x-content-type-options":"nosniff"});response.end(readFileSync(filePath));}
function isAllowedOrigin(value){return !value||/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)||/^chrome-extension:\/\/[a-p]{32}$/.test(value)}
function titleFor(value){if(value.title)return String(value.title).trim().replace(/\s+/g," ").slice(0,160);if(value.modality==="conversation")return `${value.conversation?.provider??"Agent"} conversation`;if(value.modality==="link")return String(value.pageMetadata?.pageTitle??value.sourceTitle??host(value.sourceUrl)??"Untitled link").trim();if(value.modality==="image"&&String(value.contentText??"").trim())return truncateCharacters(String(value.contentText).trim(),15);return String(value.contentText??value.sourceTitle??value.contentUrl??"Untitled Pick").trim().replace(/\s+/g," ").slice(0,80)}
function summaryFor(value){return String(value.pageMetadata?.description??(value.modality==="link"?"":value.contentText)??value.contentUrl??"").trim().replace(/\s+/g," ").slice(0,240)}
function kindFor(value){return value==="conversation"?"agent-output":value==="link"?"webpage":value}
function host(value){try{return new URL(value).hostname.replace(/^www\./,"")}catch{return "Browser"}}
function originOf(value){try{return new URL(value).origin}catch{return ""}}
function truncateCharacters(value,max){return [...value].slice(0,max).join("")}
function safeName(value,extension,id){return `${String(value??"image").replace(/[\\/:*?"<>|]/g," ").replace(/\s+/g," ").trim().slice(0,64)||"image"}-${id.slice(-6)}${extension}`}
function label(value){return ({text:"文字",image:"图片",video:"视频",audio:"音频",link:"链接",conversation:"对话"})[value]??"素材"}
function parse(value){try{return JSON.parse(value??"{}")||{}}catch{return {}}}
function objectValue(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
function externalUrl(value){return typeof value==="string"&&/^https?:\/\//i.test(value)?value:null}
function transferSource(from, sourceItemId, value) {
  const targetBookId = String(value.targetBookId ?? ""), mode = String(value.mode ?? "");
  if (!targetBookId || !["copy", "move"].includes(mode)) throw new Error("请选择目标 Book 和操作方式");
  if (targetBookId === from.book.id) throw new Error("素材已经在此 Book 中");
  const target = context(targetBookId), row = from.db.prepare(`SELECT source_items.*,resources.kind,resources.title AS resourceTitle,resources.summary,resources.content_hash AS contentHash,resources.favorite,sources.label AS sourceLabel,sources.url AS sourceUrl,sources.picked_at AS sourcePickedAt,text_contents.text AS contentText,assets.mime_type AS mimeType,assets.original_url AS originalUrl,assets.cache_state AS cacheState,assets.link_state AS linkState,assets.file_name AS fileName,picks.modality,picks.pick_type AS pickType,picks.metadata_json AS metadataJson,picks.picked_at AS pickPickedAt FROM source_items JOIN resources ON resources.id=source_items.resource_id JOIN sources ON sources.id=source_items.source_id LEFT JOIN text_contents ON text_contents.resource_id=resources.id LEFT JOIN assets ON assets.resource_id=resources.id JOIN picks ON picks.source_item_id=source_items.id WHERE source_items.id=?`).get(sourceItemId);
  if (!row) throw new Error("素材不存在");
  const existing = target.db.prepare("SELECT id FROM resources WHERE content_hash=?").get(row.contentHash);
  ensureBookCapacity(target);
  const suffix = crypto.randomUUID().slice(0, 8), sourceId = `source-${suffix}`, resourceId = existing?.id ?? `resource-${suffix}`, targetSourceItemId = `source-item-${suffix}`, pickId = `pick-${suffix}`;
  transaction(target.db, () => {
    target.db.prepare("INSERT INTO sources (id,label,url,picked_at) VALUES (?,?,?,?)").run(sourceId, row.sourceLabel, row.sourceUrl, row.sourcePickedAt);
    if (!existing) {
      target.db.prepare("INSERT INTO resources (id,kind,source_id,title,summary,content_hash,created_at,favorite) VALUES (?,?,?,?,?,?,?,?)").run(resourceId,row.kind,sourceId,row.resourceTitle,row.summary,row.contentHash,row.created_at,row.favorite);
      if (row.contentText && !["image", "video"].includes(row.modality)) target.db.prepare("INSERT INTO text_contents (resource_id,text) VALUES (?,?)").run(resourceId,row.contentText);
      if (row.mimeType) copyAsset(from, target, row, resourceId, suffix);
    } else {
      const existingAsset = target.db.prepare("SELECT id,cache_state FROM assets WHERE resource_id=? LIMIT 1").get(resourceId);
      if ((!existingAsset || existingAsset.cache_state !== "cached") && row.mimeType && row.fileName && existsSync(join(from.mediaRoot, row.fileName))) {
        if (existingAsset) target.db.prepare("DELETE FROM assets WHERE id=?").run(existingAsset.id);
        copyAsset(from, target, row, resourceId, suffix);
      }
      const old = target.db.prepare("SELECT note FROM source_items WHERE resource_id=? ORDER BY created_at DESC LIMIT 1").get(resourceId);
      if (old?.note && row.note && !old.note.includes(row.note)) row.note = `${old.note}, ${row.note}`;
    }
    target.db.prepare("INSERT INTO source_items (id,resource_id,source_id,title,note,storage_state,created_at) VALUES (?,?,?,?,?,?,?)").run(targetSourceItemId,resourceId,sourceId,row.title,row.note,row.storage_state,row.created_at);
    target.db.prepare("INSERT INTO picks (id,resource_id,source_id,source_item_id,modality,pick_type,metadata_json,picked_at) VALUES (?,?,?,?,?,?,?,?)").run(pickId,resourceId,sourceId,targetSourceItemId,row.modality,row.pickType,row.metadataJson,row.pickPickedAt);
  });
  if (mode === "move") removeItems(from, [sourceItemId]);
  return { ok: true, mode, sourceItemId: targetSourceItemId, targetBookId, merged: Boolean(existing) };
}
function copyAsset(from, target, row, resourceId, suffix) {
  const id = `asset-${suffix}`;
  let fileName = row.fileName, fileUri = row.originalUrl || "", state = row.cacheState;
  if (fileName && existsSync(join(from.mediaRoot, fileName))) {
    const extension = extname(fileName); let next = safeName(row.resourceTitle, extension, id), index = 2;
    while (existsSync(join(target.mediaRoot, next))) next = safeName(`${row.resourceTitle} ${index++}`, extension, id);
    writeFileSync(join(target.mediaRoot, next), readFileSync(join(from.mediaRoot, fileName))); fileName = next; fileUri = `/api/books/${target.book.id}/media/${id}`; state = "cached";
  } else { fileName = null; if (state === "cached") state = "missing"; }
  target.db.prepare("INSERT INTO assets (id,resource_id,mime_type,original_url,file_uri,cache_state,file_name,link_state) VALUES (?,?,?,?,?,?,?,?)").run(id,resourceId,row.mimeType,row.originalUrl,fileUri,state,fileName,row.linkState ?? (row.originalUrl ? "linked" : "none"));
}
function backup(response) { const data = library.backup(); response.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="sourcebook-${new Date().toISOString().slice(0,10)}.sourcebook-backup"` }); response.end(data); }
function moveToTrash(path) { if (!existsSync(path)) return; const trash = join(dirname(path), ".trash"); mkdirSync(trash, { recursive: true }); renameSync(path, join(trash, `${Date.now()}-${path.split("/").pop()}`)); }
function transaction(db, callback){db.exec("BEGIN");try{callback();db.exec("COMMIT")}catch(error){db.exec("ROLLBACK");throw error}}
function json(response,payload,status=200){response.writeHead(status,{"content-type":"application/json; charset=utf-8"});response.end(JSON.stringify(payload))}
function body(request){return new Promise((resolve,reject)=>{let value="";request.on("data",chunk=>{value+=chunk;if(value.length>30*1024*1024)request.destroy(new Error("请求过大"))});request.on("end",()=>{try{resolve(value?JSON.parse(value):{})}catch(error){reject(error)}});request.on("error",reject)})}
