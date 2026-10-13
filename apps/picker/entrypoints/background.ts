import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { PICKER_LANGUAGE_KEY, storedPickerLanguage, type UiLanguage } from "../src/shared/i18n";
import { uniqueCoverCandidates } from "../src/shared/page";
import type { PickerMessage, PickerMessageResponse, PickResponse, PickerBook, PickerStatusResponse, PickPayload, RecentPickSummary, ResolvedPickPayload } from "../src/shared/types";

const DEFAULT_SERVICE_ORIGINS = ["http://127.0.0.1:4177", "http://127.0.0.1:4297"];
const SERVICE_ORIGIN_KEY = "sourcebookServiceOrigin";
const LEGACY_PENDING_KEY = "pendingPicks";
const LEGACY_RECENT_KEY = "recentPicks";
const PICKER_ENABLED_KEY = "pickerEnabled";
const ACTIVE_BOOK_KEY = "activeBookId";
let resolvedServiceOrigin: string | undefined;
const copy = {
  zh: {
    pickSelection: "Pick 选中文本",
    pickImage: "Pick 图片",
    pickVideo: "Pick 视频",
    pickAudio: "Pick 音频",
    pickLink: "Pick 链接",
    pickPage: "Pick 网页",
    avifConversionFailed: "无法将 AVIF 图片转换为 WebP，请重试。",
    reopenFailed: "无法重新打开插件窗口。",
    noteFailed: "Note 保存失败。",
    desktopUnavailable: "Sourcebook Desktop 未连接。",
    pickFailed: "Pick 保存失败。",
    imageDownloadFailed: "图片下载失败。",
    chooseBookBeforeEditing: "请先选择 Book，再编辑素材。",
    moveFailed: "无法移动这个 Pick。",
    bookCreateFailed: "无法创建 Book。",
    chooseBookBeforePicking: "请先选择 Book，再 Pick。",
    missingBook: "所选 Book 已不存在，请选择其他 Book。",
    bookSelectFailed: "无法选择此 Book。"
  },
  en: {
    pickSelection: "Pick selection",
    pickImage: "Pick image",
    pickVideo: "Pick video",
    pickAudio: "Pick audio",
    pickLink: "Pick link",
    pickPage: "Pick webpage",
    avifConversionFailed: "Could not convert the AVIF image to WebP. Please try again.",
    reopenFailed: "Could not reopen the extension popup.",
    noteFailed: "Note could not be saved.",
    desktopUnavailable: "Sourcebook Desktop is not connected.",
    pickFailed: "Pick could not be saved.",
    imageDownloadFailed: "Image download failed.",
    chooseBookBeforeEditing: "Choose a Book before editing a Source.",
    moveFailed: "Could not move this Pick.",
    bookCreateFailed: "Book could not be created.",
    chooseBookBeforePicking: "Choose a Book before picking.",
    missingBook: "The selected Book no longer exists. Choose another Book before picking.",
    bookSelectFailed: "Book could not be selected."
  }
};
let locale: UiLanguage = "en";
let text = copy[locale];

type RecentPickResult = {
  items: RecentPickSummary[];
  localServiceConnected: boolean;
};

type BookState = {
  activeBookId?: string;
  books: PickerBook[];
  needsBookSelection: boolean;
};

class PickerApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

class LocalServiceUnavailableError extends Error {}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void refreshLanguage();
    void browser.storage.local.remove([LEGACY_PENDING_KEY, LEGACY_RECENT_KEY]);
  });

  browser.runtime.onStartup.addListener(() => {
    void refreshLanguage();
    void browser.storage.local.remove([LEGACY_PENDING_KEY, LEGACY_RECENT_KEY]);
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[PICKER_LANGUAGE_KEY]) void refreshLanguage();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "pick-current") void pickActiveTab();
  });

  browser.action.onClicked?.addListener((tab) => {
    if (tab.id) void browser.tabs.sendMessage(tab.id, { type: "PICK_PAGE" } satisfies PickerMessage);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab);
  });

  browser.runtime.onMessage.addListener((message: PickerMessage): Promise<PickerMessageResponse> | undefined => {
    if (message.type === "SAVE_PICK") return savePick(message.payload);
    if (message.type === "OPEN_SOURCES") return openSources(message.bookId);
    if (message.type === "OPEN_PICKER_POPUP") return openPickerPopup();
    if (message.type === "UPDATE_SOURCE_NOTE") return updateSourceNote(message.sourceItemId, message.note);
    if (message.type === "GET_PICKER_STATUS") return getActivePickerStatus();
    if (message.type === "SET_PICKER_ENABLED") return setPickerEnabled(message.enabled);
    if (message.type === "SET_ACTIVE_BOOK") return setActiveBook(message.bookId);
    if (message.type === "MOVE_PICK_TO_BOOK") return movePickToBook(message.sourceItemId, message.sourceBookId, message.targetBookId);
    if (message.type === "CREATE_BOOK") return createBook(message.name);
    return undefined;
  });
});

async function refreshLanguage() {
  const stored = await browser.storage.local.get(PICKER_LANGUAGE_KEY);
  locale = storedPickerLanguage(stored[PICKER_LANGUAGE_KEY]);
  text = copy[locale];
  await setupContextMenus();
}

async function setupContextMenus() {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    id: "pick-selection",
    title: text.pickSelection,
    contexts: ["selection"]
  });

  browser.contextMenus.create({
    id: "pick-image",
    title: text.pickImage,
    contexts: ["image"]
  });

  browser.contextMenus.create({
    id: "pick-video",
    title: text.pickVideo,
    contexts: ["video"]
  });

  browser.contextMenus.create({
    id: "pick-audio",
    title: text.pickAudio,
    contexts: ["audio"]
  });

  browser.contextMenus.create({
    id: "pick-link",
    title: text.pickLink,
    contexts: ["link"]
  });

  browser.contextMenus.create({
    id: "pick-page",
    title: text.pickPage,
    contexts: ["page"]
  });
}

async function pickActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "PICK_ACTIVE" } satisfies PickerMessage);
  } catch {
    if (tab.url) {
      await savePick(pagePayloadFromTab(tab));
    }
  }
}

async function handleContextMenu(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) {
  if (!tab?.url) return;

  if (info.menuItemId === "pick-page") {
    await savePick(pagePayloadFromTab(tab));
    return;
  }

  if (info.menuItemId === "pick-selection" && info.selectionText) {
    await savePick(basePayload(tab, "text", "selection", {
      contentText: info.selectionText.trim(),
      locator: {
        textQuote: { exact: info.selectionText.trim() }
      }
    }));
    return;
  }

  if (info.menuItemId === "pick-image" && info.srcUrl) {
    await savePick(basePayload(tab, "image", "image", {
      contentText: undefined,
      contentUrl: info.srcUrl,
      thumbnailUrl: info.srcUrl
    }));
    return;
  }

  if (info.menuItemId === "pick-video" && info.srcUrl) {
    await savePick(basePayload(tab, "video", "video", {
      contentText: tab.title || info.srcUrl,
      contentUrl: info.srcUrl
    }));
    return;
  }

  if (info.menuItemId === "pick-audio" && info.srcUrl) {
    await savePick(basePayload(tab, "audio", "audio", {
      contentText: tab.title || info.srcUrl,
      contentUrl: info.srcUrl
    }));
    return;
  }

  if (info.menuItemId === "pick-link" && info.linkUrl) {
    const title = info.selectionText?.trim() || info.linkUrl;
    await savePick(basePayload(tab, "link", "link", {
      contentUrl: info.linkUrl,
      sourceUrl: info.linkUrl,
      sourceTitle: title,
      sourceOrigin: originFromUrl(info.linkUrl),
      pageMetadata: { pageTitle: title, canonicalUrl: info.linkUrl }
    }));
  }
}

async function serviceOrigin(): Promise<string> {
  if (resolvedServiceOrigin) return resolvedServiceOrigin;

  const stored = await browser.storage.local.get(SERVICE_ORIGIN_KEY);
  const candidates = [stored[SERVICE_ORIGIN_KEY], ...DEFAULT_SERVICE_ORIGINS]
    .filter((value): value is string => typeof value === "string" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value))
    .filter((value, index, values) => values.indexOf(value) === index);

  for (const origin of candidates) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(800) });
      const health = response.ok ? await response.json() as { app?: string; connection?: { origin?: string } } : null;
      if (health?.app !== "sourcebook-for-agents") continue;
      resolvedServiceOrigin = health.connection?.origin && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(health.connection.origin) ? health.connection.origin : origin;
      await browser.storage.local.set({ [SERVICE_ORIGIN_KEY]: resolvedServiceOrigin });
      return resolvedServiceOrigin;
    } catch {
      // Try the next known Sourcebook Desktop endpoint.
    }
  }

  throw new LocalServiceUnavailableError("Sourcebook Desktop is unavailable.");
}

async function serviceFetch(path: string, init?: RequestInit): Promise<Response> {
  const origin = await serviceOrigin();
  try {
    return await fetch(`${origin}/api${path}`, init);
  } catch {
    if (resolvedServiceOrigin === origin) resolvedServiceOrigin = undefined;
    throw new LocalServiceUnavailableError("Sourcebook Desktop is unavailable.");
  }
}

async function responseError(response: Response): Promise<PickerApiError> {
  const value = await response.json().catch(() => null) as { error?: string; code?: string } | null;
  return new PickerApiError(value?.code || "REQUEST_FAILED", value?.error || `Sourcebook returned ${response.status}.`, response.status);
}

function isOffline(error: unknown): boolean {
  return error instanceof LocalServiceUnavailableError;
}

async function savePick(payload: PickPayload): Promise<PickerMessageResponse> {
  try {
    const preparedPayload = await prepareMediaPayload(await withActiveBook(payload));
    const response = await serviceFetch("/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preparedPayload)
    });

    if (!response.ok) throw await responseError(response);
    let result: PickResponse = { ...((await response.json()) as PickResponse), bookId: preparedPayload.bookId };
    if (preparedPayload.modality === "image" && !preparedPayload.contentBase64) {
      result = await downloadPickedImage(result, preparedPayload.bookId);
    }
    return result;
  } catch (error) {
    return { status: "error", message: isOffline(error) ? text.desktopUnavailable : error instanceof Error ? error.message : text.pickFailed };
  }
}

async function prepareMediaPayload(payload: ResolvedPickPayload): Promise<ResolvedPickPayload> {
  if (payload.modality === "image" && payload.contentUrl && !payload.contentBase64) {
    const image = await fetchPortableImage(payload.contentUrl, payload.sourceUrl, true);
    if (image) return { ...payload, contentBase64: image.base64, contentMimeType: image.mimeType };
  }
  if ((payload.modality === "video" || payload.modality === "post") && !payload.thumbnailBase64) {
    const candidates = uniqueThumbnailCandidates(payload.thumbnailUrl, payload.thumbnailCandidates);
    for (const thumbnailUrl of candidates) {
      const image = await fetchPortableImage(thumbnailUrl, payload.sourceUrl);
      if (image) return { ...payload, thumbnailUrl, thumbnailBase64: image.base64, thumbnailMimeType: image.mimeType };
    }
  }
  return payload;
}

function uniqueThumbnailCandidates(primary: string | undefined, alternatives: string[] | undefined): string[] {
  return uniqueCoverCandidates([primary, ...(alternatives || [])]);
}

async function fetchPortableImage(url: string, sourceUrl: string, failOnAvif = false): Promise<{ base64: string; mimeType: string } | undefined> {
  if (url.startsWith("blob:")) return undefined;
  try {
    // Some CDNs reject an extension-origin request with page credentials, while
    // others require the page referer. Try the page-context form first, then a
    // deliberately cookie-free image request for public thumbnails such as YouTube.
    let response = await fetch(url, { credentials: "include", referrer: sourceUrl, headers: { accept: "image/webp,image/apng,image/*;q=0.8,*/*;q=0.5" } });
    if (!response.ok) {
      response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", headers: { accept: "image/webp,image/apng,image/*;q=0.8,*/*;q=0.5" } });
    }
    if (!response.ok) return undefined;
    const mime = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "image/jpeg";
    // Video URLs occasionally leak into a post's candidate list. Do not read an
    // entire movie into memory only to discover it cannot be used as a cover.
    if (!mime.startsWith("image/")) return undefined;
    const sourceBlob = await response.blob();
    if (sourceBlob.size > 20 * 1024 * 1024) return undefined;
    const normalized = mime === "image/avif" ? await avifToWebp(sourceBlob) : sourceBlob;
    const bytes = new Uint8Array(await normalized.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) return undefined;
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { base64: btoa(binary), mimeType: normalized.type || mime };
  } catch (error) {
    if (failOnAvif && error instanceof AvifConversionError) throw new PickerApiError("AVIF_CONVERSION_FAILED", text.avifConversionFailed, 422);
    return undefined;
  }
}

class AvifConversionError extends Error {}

async function avifToWebp(source: Blob): Promise<Blob> {
  try {
    const image = await createImageBitmap(source);
    try {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas is unavailable");
      context.drawImage(image, 0, 0);
      return await canvas.convertToBlob({ type: "image/webp", quality: 0.92 });
    } finally {
      image.close();
    }
  } catch {
    throw new AvifConversionError();
  }
}

async function downloadPickedImage(result: PickResponse, bookId: string): Promise<PickResponse> {
  try {
    const response = await serviceFetch(`/sources/${encodeURIComponent(result.sourceItemId)}/download?bookId=${encodeURIComponent(bookId)}`, { method: "POST" });
    if (!response.ok) throw await responseError(response);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      const itemsResponse = await serviceFetch(`/sources?bookId=${encodeURIComponent(bookId)}`);
      if (!itemsResponse.ok) throw await responseError(itemsResponse);
      const value = await itemsResponse.json() as { items?: Array<{ id?: string; assetCacheState?: PickResponse["cacheState"] }> };
      const item = value.items?.find((candidate) => candidate.id === result.sourceItemId);
      if (item?.assetCacheState === "cached") return { ...result, cacheState: "cached" };
      if (item?.assetCacheState === "failed") return { ...result, cacheState: "failed", downloadError: text.imageDownloadFailed };
    }
    return { ...result, cacheState: "downloading" };
  } catch (error) {
    return { ...result, cacheState: "failed", downloadError: error instanceof Error ? error.message : text.imageDownloadFailed };
  }
}

async function getActivePickerStatus(): Promise<PickerMessageResponse> {
  const enabled = await getPickerEnabled();
  const bookState = await getBookState();
  const recentResult = await getRecentPicks(bookState.activeBookId);
  const fallback: PickerStatusResponse = {
    status: "picker_status",
    mode: "idle",
    enabled,
    pageAvailable: false,
    messageCount: 0,
    browserStoredCount: 0,
    localServiceConnected: recentResult.localServiceConnected,
    recentPicks: recentResult.items,
    activeBookId: bookState.activeBookId,
    books: bookState.books
  };

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return fallback;

  try {
    const response = (await browser.tabs.sendMessage(tab.id, { type: "GET_PICKER_STATUS" } satisfies PickerMessage)) as PickerMessageResponse;
    if (response?.status !== "picker_status") return fallback;
    return {
      ...response,
      enabled,
      pageAvailable: true,
      browserStoredCount: 0,
      localServiceConnected: recentResult.localServiceConnected,
      recentPicks: recentResult.items,
      activeBookId: bookState.activeBookId,
      books: bookState.books
    };
  } catch {
    return fallback;
  }
}

async function getPickerEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(PICKER_ENABLED_KEY);
  return stored[PICKER_ENABLED_KEY] !== false;
}

async function setPickerEnabled(enabled: boolean): Promise<PickerMessageResponse> {
  await browser.storage.local.set({ [PICKER_ENABLED_KEY]: enabled });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: "SET_PICKER_ENABLED", enabled } satisfies PickerMessage);
    } catch {
      // The popup still reflects the saved global setting even on pages where the content script cannot run.
    }
  }

  return { status: "ok" };
}

async function getRecentPicks(activeBookId?: string): Promise<RecentPickResult> {
  try {
    const response = await serviceFetch(activeBookId ? `/sources?bookId=${encodeURIComponent(activeBookId)}` : "/books");
    if (!response.ok) throw await responseError(response);
    if (!activeBookId) return { items: [], localServiceConnected: true };
    const data = (await response.json()) as { items?: Array<Record<string, unknown>> };
    if (Array.isArray(data.items)) {
      const origin = await serviceOrigin();
      return {
        items: data.items.slice(0, 5).map((item) => recentPickFromSourceItem(item, origin)),
        localServiceConnected: true
      };
    }
  } catch {}

  return {
    items: [],
    localServiceConnected: false
  };
}

async function openSources(bookId?: string): Promise<PickerMessageResponse> {
  try {
    const origin = await serviceOrigin();
    const targetBookId = bookId || (await getBookState()).activeBookId;
    const targetUrl = targetBookId ? `${origin}/?bookId=${encodeURIComponent(targetBookId)}` : `${origin}/`;
    const sourcebookTabs = await browser.tabs.query({ url: `${origin}/*` });
    const existingTab = sourcebookTabs.find((tab) => tab.id && tab.url && new URL(tab.url).origin === origin);
    if (existingTab?.id) {
      await browser.tabs.update(existingTab.id, { active: true, url: targetUrl });
      if (typeof existingTab.windowId === "number") await browser.windows.update(existingTab.windowId, { focused: true });
    } else {
      await browser.tabs.create({ url: targetUrl });
    }
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: isOffline(error) ? text.desktopUnavailable : error instanceof Error ? error.message : text.desktopUnavailable };
  }
}

async function openPickerPopup(): Promise<PickerMessageResponse> {
  try {
    if (browser.action.openPopup) await browser.action.openPopup();
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.reopenFailed };
  }
}

async function updateSourceNote(sourceItemId: string, note: string): Promise<PickerMessageResponse> {
  try {
    const { activeBookId } = await getBookState();
    if (!activeBookId) throw new PickerApiError("BOOK_SELECTION_REQUIRED", text.chooseBookBeforeEditing, 400);
    const response = await serviceFetch(`/sources/${encodeURIComponent(sourceItemId)}/note?bookId=${encodeURIComponent(activeBookId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note })
    });
    if (!response.ok) throw await responseError(response);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.noteFailed };
  }
}

async function movePickToBook(sourceItemId: string, sourceBookId: string, targetBookId: string): Promise<PickerMessageResponse> {
  try {
    if (sourceBookId === targetBookId) return { status: "moved", sourceItemId, bookId: targetBookId };
    const response = await serviceFetch(`/books/${encodeURIComponent(sourceBookId)}/sources/${encodeURIComponent(sourceItemId)}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetBookId, mode: "move" })
    });
    if (!response.ok) throw await responseError(response);
    const value = await response.json() as { sourceItemId?: string };
    await setActiveBook(targetBookId);
    return { status: "moved", sourceItemId: value.sourceItemId || sourceItemId, bookId: targetBookId };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.moveFailed };
  }
}

async function createBook(name: string): Promise<PickerMessageResponse> {
  try {
    const response = await serviceFetch("/books?source=picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw await responseError(response);
    const value = await response.json() as { book?: PickerBook };
    if (!value.book) throw new Error(text.bookCreateFailed);
    return { status: "book_created", book: value.book };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.bookCreateFailed };
  }
}

async function getBookState(): Promise<BookState> {
  const stored = await browser.storage.local.get(ACTIVE_BOOK_KEY);
  const remembered = typeof stored[ACTIVE_BOOK_KEY] === "string" ? stored[ACTIVE_BOOK_KEY] : undefined;
  try {
    const response = await serviceFetch("/books");
    if (!response.ok) throw await responseError(response);
    const value = await response.json() as { activeBookId?: string; books?: PickerBook[] };
    const books = Array.isArray(value.books) ? value.books : [];
    const rememberedStillExists = !remembered || books.some((book) => book.id === remembered);
    const activeBookId = remembered ? (rememberedStillExists ? remembered : undefined) : value.activeBookId;
    if (!remembered && activeBookId) await browser.storage.local.set({ [ACTIVE_BOOK_KEY]: activeBookId });
    return { activeBookId, books, needsBookSelection: Boolean(remembered && !rememberedStillExists) };
  } catch {
    return { activeBookId: remembered, books: [], needsBookSelection: false };
  }
}

async function withActiveBook(payload: PickPayload): Promise<ResolvedPickPayload> {
  if (payload.bookId) return payload as ResolvedPickPayload;
  const { activeBookId, needsBookSelection } = await getBookState();
  if (!activeBookId) throw new PickerApiError(needsBookSelection ? "BOOK_NOT_FOUND" : "BOOK_SELECTION_REQUIRED", needsBookSelection ? text.missingBook : text.chooseBookBeforePicking, 400);
  return { ...payload, bookId: activeBookId };
}

async function setActiveBook(bookId: string): Promise<PickerMessageResponse> {
  try {
    const { books } = await getBookState();
    if (!books.some((book) => book.id === bookId)) throw new PickerApiError("BOOK_NOT_FOUND", text.missingBook, 404);
    await browser.storage.local.set({ [ACTIVE_BOOK_KEY]: bookId });
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.bookSelectFailed };
  }
}

function pagePayloadFromTab(tab: Browser.tabs.Tab): Omit<PickPayload, "bookId"> {
  return basePayload(tab, "link", "whole_page", {
    contentUrl: tab.url,
    pageMetadata: {
      pageTitle: tab.title || hostFromUrl(tab.url || "") || "Untitled page"
    }
  });
}

function basePayload(
  tab: Browser.tabs.Tab,
  modality: PickPayload["modality"],
  pickType: PickPayload["pickType"],
  overrides: Partial<Omit<PickPayload, "bookId">>
): Omit<PickPayload, "bookId"> {
  const sourceUrl = tab.url || "";
  return {
    sourceType: "webpage",
    modality,
    pickType,
    sourceUrl,
    sourceTitle: tab.title || hostFromUrl(sourceUrl) || "Untitled page",
    sourceOrigin: originFromUrl(sourceUrl),
    faviconUrl: tab.favIconUrl,
    pickedAt: new Date().toISOString(),
    ...overrides
  };
}

function recentPickFromSourceItem(item: Record<string, unknown>, serviceBaseUrl: string): RecentPickSummary {
  return {
    id: String(item.id || crypto.randomUUID()),
    title: String(item.itemTitle || item.contentText || item.contentUrl || "Pick"),
    modality:
      item.modality === "image" ||
      item.modality === "video" ||
      item.modality === "audio" ||
      item.modality === "link" ||
      item.modality === "post" ||
      item.modality === "conversation"
        ? item.modality
        : "text",
    status: "saved",
    sourceOrigin: String(item.sourceOrigin || ""),
    pickedAt: String(item.pickedAt || new Date().toISOString()),
    thumbnailUrl: resolveThumbnailUrl(item.thumbnailUrl, serviceBaseUrl),
    faviconUrl: resolveThumbnailUrl(item.faviconUrl, serviceBaseUrl)
  };
}

function resolveThumbnailUrl(value: unknown, serviceBaseUrl: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try { return new URL(value, serviceBaseUrl).toString(); } catch { return undefined; }
}

function originFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
