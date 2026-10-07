import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const LIBRARY_VERSION = 1;

export function createLibrary({ legacyDbPath, libraryRoot = process.env.SOURCEBOOK_LIBRARY_DIR, locationConfigPath = process.env.SOURCEBOOK_LIBRARY_CONFIG }) {
  const root = resolve(libraryRoot || join(dirname(legacyDbPath), "Sourcebook Library"));
  const manifestPath = join(root, "library.json");
  const cache = new Map();
  mkdirSync(join(root, "books"), { recursive: true });

  function readManifest() {
    if (!existsSync(manifestPath)) {
      const manifest = { version: LIBRARY_VERSION, activeBookId: "sourcebook", books: [{ id: "sourcebook", name: "Default Book", createdAt: new Date().toISOString() }] };
      writeManifest(manifest);
      migrateLegacy(manifest.books[0]);
      return manifest;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const defaultBook = manifest.books?.find((book) => book.id === "sourcebook");
    if (manifest.books?.length === 1 && ["Sourcebook", "My Sources"].includes(defaultBook?.name)) { defaultBook.name = "Default Book"; writeManifest(manifest); }
    if (!Array.isArray(manifest.books) || !manifest.books.length) {
      manifest.books = [{ id: "sourcebook", name: "Default Book", createdAt: new Date().toISOString() }];
      manifest.activeBookId = "sourcebook";
      writeManifest(manifest);
    }
    return manifest;
  }

  function writeManifest(manifest) {
    mkdirSync(root, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: LIBRARY_VERSION }, null, 2));
  }

  function bookPath(book) { return join(root, "books", book.id); }

  function migrateLegacy(book) {
    if (!existsSync(legacyDbPath)) return;
    const target = join(bookPath(book), "book.sqlite");
    if (existsSync(target)) return;
    mkdirSync(bookPath(book), { recursive: true });
    cpSync(legacyDbPath, target);
    const legacyAssets = join(dirname(legacyDbPath), "assets");
    if (existsSync(legacyAssets)) cpSync(legacyAssets, join(bookPath(book), "assets"), { recursive: true });
  }

  function schema(db) {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    try { db.exec("ALTER TABLE inbox_items RENAME TO source_items"); } catch { /* Current schema. */ }
    try { db.exec("ALTER TABLE sources RENAME COLUMN captured_at TO picked_at"); } catch { /* Current schema. */ }
    try { db.exec("ALTER TABLE source_items RENAME COLUMN capture_state TO storage_state"); } catch { /* Current schema. */ }
    try { db.exec("ALTER TABLE picks RENAME COLUMN inbox_item_id TO source_item_id"); } catch { /* Current schema. */ }
    try { db.exec("ALTER TABLE picks RENAME COLUMN captured_at TO picked_at"); } catch { /* Current schema. */ }
    try { db.exec("ALTER TABLE source_pack_items RENAME COLUMN inbox_item_id TO source_item_id"); } catch { /* Current schema. */ }
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, label TEXT NOT NULL, url TEXT NOT NULL, picked_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL, summary TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS text_contents (resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE, text TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE, mime_type TEXT NOT NULL, original_url TEXT, file_uri TEXT NOT NULL, cache_state TEXT NOT NULL, file_name TEXT);
      CREATE TABLE IF NOT EXISTS source_items (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id), source_id TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', storage_state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS picks (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id), source_id TEXT NOT NULL REFERENCES sources(id), source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE, modality TEXT NOT NULL, pick_type TEXT NOT NULL, metadata_json TEXT NOT NULL, picked_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_packs (id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, output_path TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_pack_items (source_pack_id TEXT NOT NULL REFERENCES source_packs(id) ON DELETE CASCADE, source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE, PRIMARY KEY (source_pack_id, source_item_id));
    `);
    try { db.exec("ALTER TABLE resources ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0"); } catch { /* Existing schema. */ }
    try { db.exec("ALTER TABLE assets ADD COLUMN link_state TEXT NOT NULL DEFAULT 'linked'"); } catch { /* Existing schema. */ }
    db.exec("UPDATE assets SET cache_state='pending' WHERE cache_state='external_reference'");
    db.exec("UPDATE assets SET link_state='none' WHERE original_url IS NULL");
    db.exec("UPDATE picks SET modality='link' WHERE modality='page'");
    db.exec("UPDATE resources SET kind='webpage' WHERE id IN (SELECT resource_id FROM picks WHERE modality='link' AND pick_type!='local_import')");
    db.exec(`UPDATE picks SET modality=COALESCE((SELECT CASE WHEN mime_type LIKE 'image/%' THEN 'image' WHEN mime_type LIKE 'video/%' THEN 'video' WHEN mime_type LIKE 'audio/%' THEN 'audio' WHEN mime_type LIKE 'text/%' OR mime_type IN ('application/rtf','text/markdown') THEN 'text' END FROM assets WHERE assets.resource_id=picks.resource_id),modality) WHERE pick_type='local_import'`);
  }

  function context(bookId) {
    const manifest = readManifest();
    const book = manifest.books.find((entry) => entry.id === bookId) || null;
    if (!book) throw new Error("Book 不存在或已被删除，请重新选择。");
    if (cache.has(book.id)) return cache.get(book.id);
    const rootPath = bookPath(book);
    const mediaRoot = join(rootPath, "assets");
    mkdirSync(mediaRoot, { recursive: true });
    const db = new DatabaseSync(join(rootPath, "book.sqlite"));
    schema(db);
    const value = { book, db, root: rootPath, mediaRoot };
    cache.set(book.id, value);
    return value;
  }

  function list() {
    const manifest = readManifest();
    return { activeBookId: manifest.activeBookId, books: manifest.books.map((book) => ({ ...book })) };
  }

  function create(name) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!cleanName) throw new Error("Book 名称不能为空");
    const manifest = readManifest();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book";
    let id = slug, number = 2;
    while (manifest.books.some((book) => book.id === id)) id = `${slug}-${number++}`;
    const book = { id, name: cleanName, createdAt: new Date().toISOString() };
    manifest.books.push(book);
    writeManifest(manifest);
    context(id);
    return book;
  }

  function rename(bookId, name) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!cleanName) throw new Error("Book 名称不能为空");
    const manifest = readManifest();
    const book = manifest.books.find((entry) => entry.id === bookId);
    if (!book) throw new Error("Book 不存在或已被删除，请重新选择。");
    book.name = cleanName;
    writeManifest(manifest);
    return { ...book };
  }

  function remove(bookId) {
    const manifest = readManifest();
    const book = manifest.books.find((entry) => entry.id === bookId);
    if (!book) throw new Error("Book 不存在或已被删除，请重新选择。");
    if (manifest.books.length <= 1) throw new Error("至少需要保留一个 Book。");
    const cached = cache.get(book.id);
    if (cached) { cached.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); cached.db.close(); cache.delete(book.id); }
    const trash = join(root, ".trash");
    mkdirSync(trash, { recursive: true });
    renameSync(bookPath(book), join(trash, `${Date.now()}-${book.id}`));
    manifest.books = manifest.books.filter((entry) => entry.id !== book.id);
    if (manifest.activeBookId === book.id) manifest.activeBookId = manifest.books[0].id;
    writeManifest(manifest);
    return { ...list(), deletedBookId: book.id };
  }

  function setActive(bookId) {
    const manifest = readManifest();
    if (!manifest.books.some((book) => book.id === bookId)) throw new Error("Book 不存在或已被删除，请重新选择。");
    manifest.activeBookId = bookId;
    writeManifest(manifest);
    return list();
  }

  function backup() {
    const manifest = readManifest();
    const books = manifest.books.map((book) => {
      const ctx = context(book.id);
      ctx.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const files = walk(ctx.root).map((path) => {
        const relativePath = path.slice(ctx.root.length + 1).replaceAll("\\", "/");
        const bytes = readFileSync(path);
        return { path: relativePath, bytes: bytes.toString("base64"), size: bytes.length, sha256: digest(bytes) };
      });
      return { ...book, files };
    });
    return gzipSync(Buffer.from(JSON.stringify({ format: "sourcebook-backup", version: 1, createdAt: new Date().toISOString(), library: { activeBookId: manifest.activeBookId }, books })));
  }

  function restore(buffer, mode) {
    const value = JSON.parse(gunzipSync(buffer).toString("utf8"));
    if (value?.format !== "sourcebook-backup" || !Array.isArray(value.books)) throw new Error("不是有效的 Sourcebook 备份文件");
    for (const book of value.books) for (const entry of book.files || []) {
      const bytes = Buffer.from(entry.bytes, "base64");
      if (bytes.length !== entry.size || digest(bytes) !== entry.sha256) throw new Error(`备份校验失败：${entry.path}`);
    }
    if (mode === "replace") {
      for (const ctx of cache.values()) ctx.db.close();
      cache.clear();
      const staging = `${root}.restore-${Date.now()}`;
      mkdirSync(join(staging, "books"), { recursive: true });
      const manifest = { version: LIBRARY_VERSION, activeBookId: value.library?.activeBookId || value.books[0]?.id, books: value.books.map(({ files, ...book }) => book) };
      writeBackupBooks(staging, value.books);
      writeFileSync(join(staging, "library.json"), JSON.stringify(manifest, null, 2));
      const old = `${root}.previous-${Date.now()}`;
      renameSync(root, old); renameSync(staging, root); rmSync(old, { recursive: true, force: true });
      return list();
    }
    const manifest = readManifest();
    const imported = [];
    for (const source of value.books) {
      let id = source.id, suffix = 2;
      while (manifest.books.some((book) => book.id === id)) id = `${source.id}-${suffix++}`;
      const book = { id, name: manifest.books.some((candidate) => candidate.name === source.name) ? `${source.name} ${suffix - 1}` : source.name, createdAt: new Date().toISOString() };
      writeBackupBook(root, book, source.files || []);
      manifest.books.push(book); imported.push(book);
    }
    writeManifest(manifest);
    return { ...list(), imported };
  }

  function migrate(destination) {
    const target = resolve(String(destination || ""));
    if (!target || target === root) throw new Error("请选择不同的素材库位置");
    const targetRoot = join(target, basename(root));
    if (existsSync(targetRoot)) throw new Error("目标位置已存在同名素材库");
    for (const ctx of cache.values()) ctx.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    cpSync(root, targetRoot, { recursive: true, errorOnExist: true });
    if (!existsSync(join(targetRoot, "library.json"))) { rmSync(targetRoot, { recursive: true, force: true }); throw new Error("素材库校验失败"); }
    if (locationConfigPath) {
      mkdirSync(dirname(locationConfigPath), { recursive: true });
      writeFileSync(locationConfigPath, JSON.stringify({ libraryRoot: targetRoot, previousRoot: root, migratedAt: new Date().toISOString() }, null, 2));
    }
    return { targetRoot, restartRequired: true };
  }

  return { root, list, create, rename, remove, setActive, context, backup, restore, migrate };
}

function walk(root) {
  const result = [];
  for (const entry of (existsSync(root) ? readdirSync(root, { withFileTypes: true }) : [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(path)); else if (entry.isFile() && !entry.name.endsWith("-wal") && !entry.name.endsWith("-shm")) result.push(path);
  }
  return result;
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function writeBackupBooks(root, books) { for (const book of books) writeBackupBook(root, book, book.files || []); }
function writeBackupBook(root, book, files) { const destination = join(root, "books", book.id); for (const entry of files) { const target = resolve(destination, entry.path); if (!target.startsWith(`${destination}/`)) throw new Error("备份包含非法路径"); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, Buffer.from(entry.bytes, "base64")); } }
