import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { browserLanguage } from "../src/shared/i18n";
import type { CaptureMessage, CaptureMessageResponse, CaptureResponse, PickerStatusResponse, PickPayload, RecentPickSummary } from "../src/shared/types";

const SERVICE_BASE_URL = "http://127.0.0.1:4177/api";
// The browser-first Companion serves both the Sources workspace and its API.
const APP_URL = "http://127.0.0.1:4177/";
const PENDING_KEY = "pendingPicks";
const PICKER_ENABLED_KEY = "pickerEnabled";
const RECENT_PICKS_KEY = "recentPicks";
const MAX_PENDING = 30;
const MAX_RECENT = 30;
const locale = browserLanguage(() => browser.i18n.getUILanguage());
const text = {
  zh: {
    pickSelection: "Pick 选中文本",
    pickImage: "Pick 图片",
    pickVideo: "Pick 视频",
    pickLink: "Pick 链接",
    pickPage: "Pick 页面",
    reopenFailed: "无法重新打开插件窗口。",
    noteFailed: "Note 保存失败。",
    pendingMissing: "暂存项未找到。"
  },
  en: {
    pickSelection: "Pick selection",
    pickImage: "Pick image",
    pickVideo: "Pick video",
    pickLink: "Pick link",
    pickPage: "Pick page",
    reopenFailed: "Could not reopen the extension popup.",
    noteFailed: "Note could not be saved.",
    pendingMissing: "Pending item not found."
  }
}[locale];

type PendingPick = {
  id: string;
  payload: PickPayload;
  queuedAt: string;
};

type RecentPickResult = {
  items: RecentPickSummary[];
  localServiceConnected: boolean;
  browserStoredCount: number;
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void setupContextMenus();
    void flushPendingPicks();
  });

  browser.runtime.onStartup.addListener(() => {
    void flushPendingPicks();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "pick-current") void captureActiveTab();
  });

  browser.action.onClicked?.addListener((tab) => {
    if (tab.id) void browser.tabs.sendMessage(tab.id, { type: "CAPTURE_PAGE" } satisfies CaptureMessage);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab);
  });

  browser.runtime.onMessage.addListener((message: CaptureMessage): Promise<CaptureMessageResponse> | undefined => {
    if (message.type === "CAPTURE_PICK") return capturePick(message.payload);
    if (message.type === "OPEN_INBOX") return openInbox();
    if (message.type === "OPEN_PICKER_POPUP") return openPickerPopup();
    if (message.type === "UPDATE_INBOX_NOTE") return updateInboxNote(message.inboxItemId, message.note);
    if (message.type === "FLUSH_PENDING") return flushPendingPicks().then(() => ({ status: "ok" }));
    if (message.type === "GET_PICKER_STATUS") return getActivePickerStatus();
    if (message.type === "SET_PICKER_ENABLED") return setPickerEnabled(message.enabled);
    return undefined;
  });
});

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

async function captureActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "CAPTURE_ACTIVE" } satisfies CaptureMessage);
  } catch {
    if (tab.url) {
      await capturePick(pagePayloadFromTab(tab));
    }
  }
}

async function handleContextMenu(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) {
  if (!tab?.url) return;

  if (info.menuItemId === "pick-page") {
    await capturePick(pagePayloadFromTab(tab));
    return;
  }

  if (info.menuItemId === "pick-selection" && info.selectionText) {
    await capturePick(basePayload(tab, "text", "selection", {
      contentText: info.selectionText.trim(),
      locator: {
        textQuote: { exact: info.selectionText.trim() }
      }
    }));
    return;
  }

  if (info.menuItemId === "pick-image" && info.srcUrl) {
    await capturePick(basePayload(tab, "image", "image", {
      contentText: undefined,
      contentUrl: info.srcUrl,
      thumbnailUrl: info.srcUrl
    }));
    return;
  }

  if (info.menuItemId === "pick-video" && info.srcUrl) {
    await capturePick(basePayload(tab, "video", "video", {
      contentText: tab.title || info.srcUrl,
      contentUrl: info.srcUrl
    }));
    return;
  }

  if (info.menuItemId === "pick-link" && info.linkUrl) {
    await capturePick(basePayload(tab, "link", "link", {
      contentText: info.selectionText?.trim() || info.linkUrl,
      contentUrl: info.linkUrl
    }));
  }
}

async function capturePick(payload: PickPayload): Promise<CaptureMessageResponse> {
  try {
    const preparedPayload = await prepareImagePayload(payload);
    const response = await fetch(`${SERVICE_BASE_URL}/capture/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preparedPayload)
    });

    if (!response.ok) throw new Error(`Capture service returned ${response.status}`);
    const result = (await response.json()) as CaptureResponse;
    if (result.cacheState === 'failed') return {status:'error',message: locale === 'zh' ? '图片未保存，已在 Inbox 保留来源。请重新捕获重试。' : 'Image could not be saved. The source is in Inbox; pick again to retry.'};
    await rememberRecentPick(preparedPayload, result);
    return result;
  } catch {
    const result = await queuePick(payload);
    await rememberRecentPick(payload, result);
    return result;
  }
}

async function prepareImagePayload(payload: PickPayload): Promise<PickPayload> {
  if (payload.modality !== "image" || !payload.contentUrl || payload.contentBase64) return payload;
  try {
    const response = await fetch(payload.contentUrl, { credentials: "include", referrer: payload.sourceUrl, headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" } });
    if (!response.ok) return payload;
    const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) return payload;
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { ...payload, contentBase64: btoa(binary), contentMimeType: mime };
  } catch {
    return payload;
  }
}

async function queuePick(payload: PickPayload): Promise<CaptureResponse> {
  const pending = await getPendingPicks();
  const queued: PendingPick = {
    id: crypto.randomUUID(),
    payload,
    queuedAt: new Date().toISOString()
  };

  pending.unshift(queued);
  await browser.storage.local.set({
    [PENDING_KEY]: pending.slice(0, MAX_PENDING)
  });

  return {
    inboxItemId: `queued-${queued.id}`,
    resourceId: `queued-${queued.id}`,
    pickId: `queued-${queued.id}`,
    status: "queued"
  };
}

async function flushPendingPicks() {
  const pending = await getPendingPicks();
  if (!pending.length) return;

  const remaining: PendingPick[] = [];

  for (const item of pending.slice().reverse()) {
    try {
      const response = await fetch(`${SERVICE_BASE_URL}/capture/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });
      if (!response.ok) throw new Error(`Capture service returned ${response.status}`);
    } catch {
      remaining.unshift(item);
    }
  }

  await browser.storage.local.set({ [PENDING_KEY]: remaining.slice(0, MAX_PENDING) });
}

async function getPendingPicks(): Promise<PendingPick[]> {
  const stored = await browser.storage.local.get(PENDING_KEY);
  return Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] : [];
}

async function getActivePickerStatus(): Promise<CaptureMessageResponse> {
  const pending = await getPendingPicks();
  const enabled = await getPickerEnabled();
  const recentResult = await getRecentPicks();
  const fallback: PickerStatusResponse = {
    status: "picker_status",
    mode: "idle",
    enabled,
    pageAvailable: false,
    messageCount: 0,
    pendingCount: pending.length,
    pendingCapacity: MAX_PENDING,
    browserStoredCount: recentResult.browserStoredCount,
    localServiceConnected: recentResult.localServiceConnected,
    recentPicks: recentResult.items
  };

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return fallback;

  try {
    const response = (await browser.tabs.sendMessage(tab.id, { type: "GET_PICKER_STATUS" } satisfies CaptureMessage)) as CaptureMessageResponse;
    if (response?.status !== "picker_status") return fallback;
    return {
      ...response,
      enabled,
      pageAvailable: true,
      pendingCount: pending.length,
      pendingCapacity: MAX_PENDING,
      browserStoredCount: recentResult.browserStoredCount,
      localServiceConnected: recentResult.localServiceConnected,
      recentPicks: recentResult.items
    };
  } catch {
    return fallback;
  }
}

async function getPickerEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(PICKER_ENABLED_KEY);
  return stored[PICKER_ENABLED_KEY] === true;
}

async function setPickerEnabled(enabled: boolean): Promise<CaptureMessageResponse> {
  await browser.storage.local.set({ [PICKER_ENABLED_KEY]: enabled });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: "SET_PICKER_ENABLED", enabled } satisfies CaptureMessage);
    } catch {
      // The popup still reflects the saved global setting even on pages where the content script cannot run.
    }
  }

  return { status: "ok" };
}

async function getRecentPicks(): Promise<RecentPickResult> {
  const stored = await browser.storage.local.get(RECENT_PICKS_KEY);
  const storedItems = Array.isArray(stored[RECENT_PICKS_KEY]) ? stored[RECENT_PICKS_KEY].slice(0, MAX_RECENT) : [];

  try {
    const response = await fetch(`${SERVICE_BASE_URL}/inbox/items`);
    if (!response.ok) throw new Error(`Inbox returned ${response.status}`);
    const data = (await response.json()) as { items?: Array<Record<string, unknown>> };
    if (Array.isArray(data.items)) {
      return {
        items: data.items.slice(0, MAX_RECENT).map(recentPickFromInboxItem),
        localServiceConnected: true,
        browserStoredCount: storedItems.length
      };
    }
  } catch {
    // Fall back to browser-local summaries when the local service is not running.
  }

  return {
    items: storedItems,
    localServiceConnected: false,
    browserStoredCount: storedItems.length
  };
}

async function rememberRecentPick(payload: PickPayload, response: CaptureResponse): Promise<void> {
  const recent = (await getRecentPicks()).items;
  const summary: RecentPickSummary = {
    id: response.inboxItemId,
    title: titleForPayload(payload),
    modality: payload.modality,
    status: response.status,
    sourceOrigin: payload.sourceOrigin,
    capturedAt: payload.capturedAt,
    previewText: previewForPayload(payload),
    thumbnailUrl: payload.thumbnailUrl
  };

  await browser.storage.local.set({
    [RECENT_PICKS_KEY]: [summary, ...recent.filter((item) => item.id !== summary.id)].slice(0, MAX_RECENT)
  });
}

async function openInbox(): Promise<{ status: "ok" }> {
  await browser.tabs.create({ url: APP_URL });
  return { status: "ok" };
}

async function openPickerPopup(): Promise<CaptureMessageResponse> {
  try {
    if (browser.action.openPopup) await browser.action.openPopup();
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.reopenFailed };
  }
}

async function updateInboxNote(inboxItemId: string, note: string): Promise<CaptureMessageResponse> {
  if (inboxItemId.startsWith("queued-")) return updatePendingPickNote(inboxItemId, note);

  try {
    const response = await fetch(`${SERVICE_BASE_URL}/inbox/items/${encodeURIComponent(inboxItemId)}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note })
    });
    if (!response.ok) throw new Error(`Capture service returned ${response.status}`);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : text.noteFailed };
  }
}

async function updatePendingPickNote(inboxItemId: string, note: string): Promise<CaptureMessageResponse> {
  const id = inboxItemId.replace(/^queued-/, "");
  const pending = await getPendingPicks();
  const target = pending.find((item) => item.id === id);
  if (!target) return { status: "error", message: text.pendingMissing };

  target.payload.userNote = note;
  await browser.storage.local.set({ [PENDING_KEY]: pending.slice(0, MAX_PENDING) });
  return { status: "ok" };
}

function pagePayloadFromTab(tab: Browser.tabs.Tab): PickPayload {
  return basePayload(tab, "page", "whole_page", {
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
  overrides: Partial<PickPayload>
): PickPayload {
  const sourceUrl = tab.url || "";
  return {
    sourceType: "webpage",
    modality,
    pickType,
    sourceUrl,
    sourceTitle: tab.title || hostFromUrl(sourceUrl) || "Untitled page",
    sourceOrigin: originFromUrl(sourceUrl),
    faviconUrl: tab.favIconUrl,
    capturedAt: new Date().toISOString(),
    ...overrides
  };
}

function titleForPayload(payload: PickPayload): string {
  if (payload.modality === "conversation") {
    return payload.pageMetadata?.description || `${payload.conversation?.provider || "Agent"} chat`;
  }
  if (payload.modality === "page") return payload.pageMetadata?.pageTitle || payload.sourceTitle || "Page Pick";
  if (payload.modality === "image") return payload.contentText || fileNameFromUrl(payload.contentUrl) || "Image Pick";
  if (payload.modality === "video") return payload.contentText || fileNameFromUrl(payload.contentUrl) || "Video Pick";
  if (payload.modality === "link") return payload.contentText || payload.contentUrl || "Link Pick";
  return payload.contentText || "Text Pick";
}

function recentPickFromInboxItem(item: Record<string, unknown>): RecentPickSummary {
  return {
    id: String(item.id || crypto.randomUUID()),
    title: String(item.captureTitle || item.contentText || item.contentUrl || "Pick"),
    modality:
      item.modality === "image" ||
      item.modality === "video" ||
      item.modality === "link" ||
      item.modality === "page" ||
      item.modality === "conversation"
        ? item.modality
        : "text",
    status: "saved",
    sourceOrigin: String(item.sourceOrigin || ""),
    capturedAt: String(item.capturedAt || new Date().toISOString()),
    previewText: previewValue(
      item.modality === "page" && item.metadata && typeof item.metadata === "object" && "description" in item.metadata
        ? item.metadata.description
        : item.contentText || item.contentUrl
    ),
    thumbnailUrl: typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : undefined
  };
}

function previewForPayload(payload: PickPayload): string | undefined {
  const value = payload.modality === "page"
    ? payload.pageMetadata?.description || payload.pageMetadata?.siteName || payload.sourceUrl
    : payload.contentText || payload.contentUrl || payload.sourceUrl;
  return previewValue(value);
}

function previewValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, 140) : undefined;
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

function fileNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : undefined;
  } catch {
    return undefined;
  }
}
