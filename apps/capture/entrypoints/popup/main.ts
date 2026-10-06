import { browser } from "wxt/browser";
import { browserLanguage } from "../../src/shared/i18n";
import type { CaptureMessage, CaptureMessageResponse, PickerMode, PickerStatusResponse, RecentPickSummary } from "../../src/shared/types";
import "./style.css";

const status = document.querySelector<HTMLSpanElement>("#status");
const pickerToggle = document.querySelector<HTMLButtonElement>("#picker-toggle");
const help = document.querySelector<HTMLButtonElement>("#help");
const pickPage = document.querySelector<HTMLButtonElement>("#pick-page");
const startPicking = document.querySelector<HTMLButtonElement>("#start-picking");
const selectChatMessages = document.querySelector<HTMLButtonElement>("#select-chat-messages");
const savePending = document.querySelector<HTMLButtonElement>("#save-pending");
const openInbox = document.querySelector<HTMLButtonElement>("#open-inbox");
const inboxDialog = document.querySelector<HTMLElement>("#inbox-dialog");
const dialogDownload = document.querySelector<HTMLButtonElement>("#dialog-download");
const dialogClose = document.querySelector<HTMLButtonElement>("#dialog-close");
const recentStatus = document.querySelector<HTMLSpanElement>("#recent-status");
const recentPicks = document.querySelector<HTMLDivElement>("#recent-picks");

const locale = browserLanguage(() => browser.i18n.getUILanguage());
const HELP_URL = "https://example.com/canvas-picker/help";
const DOWNLOAD_URL = "https://example.com/canvas-picker/download";
const text = {
  zh: {
    checking: "检查中",
    overlayOn: "浮层开",
    overlayOff: "浮层关",
    overlayOnLabel: "关闭网页浮层",
    overlayOffLabel: "打开网页浮层",
    downloadApp: "下载主产品",
    help: "帮助",
    helpLabel: "打开帮助文档",
    helpHint: "正在打开帮助文档。",
    localConnected: "本地 Inbox 已连接",
    localDisconnected: "主程序未连接，Pick 会先暂存在浏览器。",
    downloadHint: "下载主程序后可保存到本地 Inbox。",
    disconnectedInbox: "未连接 Inbox",
    inboxDialogTitle: "未连接 Inbox",
    inboxDialogBody: "请先打开本地主程序，或下载主产品后再查看本地 Inbox。",
    dismiss: "知道了",
    saveToInbox: "保存到 Inbox",
    openInbox: "打开 Inbox",
    allSaved: "已全部保存",
    savedPendingDisabled: "已全部保存",
    disconnectedInboxHint: "打开本地主程序后可查看 Inbox。",
    recentStorageStatus: (stored: number, capacity: number, unsaved: number) => `暂存 ${stored}/${capacity}，未保存 ${unsaved}`,
    pickTools: "Pick 功能",
    startContinuousPick: "Pick 媒体",
    done: "完成",
    pickPage: "Pick 网页",
    selectMessages: "Pick 对话",
    pickPageTip: "保存当前网页的标题、URL、来源信息和正文摘要。",
    pickMediaTip: "连续选择图片、视频、链接等媒体资源，确认后保存。",
    pickChatTip: "选择多条 Agent 对话，合并保存为一个上下文片段。",
    recentPick: "最近 Pick",
    noRecent: "还没有最近内容。",
    pageSaved: "页面已保存",
    chatSaved: "对话已保存",
    mediaSaved: "媒体已保存",
    selectMessagesPrompt: "请在页面选择消息",
    retriedPending: "已尝试保存暂存内容",
    comingSoon: "暂未开放",
    enableFirst: "请先开启",
    noActiveTab: "没有当前标签",
    cannotPick: "无法 Pick",
    unsupported: "当前页不支持",
    queued: "已暂存",
    currentPageUnavailable: "当前页不可用",
    enabled: "已开启",
    disabled: "已关闭",
    settingFailed: "设置失败",
    pickingOn: "Pick 媒体资源已开启",
    exited: "已退出模式",
    chatUnavailable: "未识别聊天",
    currentPageCannotInject: "当前页面无法注入 Picker。",
    protectedPageHint: "浏览器内部页或受保护页面无法注入 Picker。",
    modePicking: "Pick 媒体资源中",
    modeChatSelecting: "Pick 对话中",
    modeReady: "Ready",
    chatDetected: (provider: string, count: number) => `${provider} · ${count} 条消息`,
    enableOverlayReason: "请先打开右上角浮层开关",
    pageUnavailableReason: "当前页面不支持 Picker",
    chatUnavailableReason: "当前页未识别出聊天消息"
  },
  en: {
    checking: "Checking",
    overlayOn: "Overlay on",
    overlayOff: "Overlay off",
    overlayOnLabel: "Turn off page overlay",
    overlayOffLabel: "Turn on page overlay",
    downloadApp: "Download app",
    help: "Help",
    helpLabel: "Open help docs",
    helpHint: "Opening help docs.",
    localConnected: "Local Inbox connected",
    localDisconnected: "Main app is not connected. Picks are temporarily stored in this browser.",
    downloadHint: "Download the main app to save into the local Inbox.",
    disconnectedInbox: "Inbox not connected",
    inboxDialogTitle: "Inbox not connected",
    inboxDialogBody: "Open the local app first, or download the main app to view your local Inbox.",
    dismiss: "Got it",
    saveToInbox: "Save to Inbox",
    openInbox: "Open Inbox",
    allSaved: "All saved",
    savedPendingDisabled: "All picks are saved",
    disconnectedInboxHint: "Open the local app to view Inbox.",
    recentStorageStatus: (stored: number, capacity: number, unsaved: number) => `Stored ${stored}/${capacity}, unsaved ${unsaved}`,
    pickTools: "Pick tools",
    startContinuousPick: "Pick media",
    done: "Done",
    pickPage: "Pick current page",
    selectMessages: "Pick agent chat",
    pickPageTip: "Save this page title, URL, source information, and readable summary.",
    pickMediaTip: "Select images, videos, and links in sequence, then confirm to save.",
    pickChatTip: "Select multiple agent messages and save them as one context fragment.",
    recentPick: "Recent Picks",
    noRecent: "No recent picks yet.",
    pageSaved: "Page saved",
    chatSaved: "Chat saved",
    mediaSaved: "Media saved",
    selectMessagesPrompt: "Select messages on the page",
    retriedPending: "Pending saves retried",
    comingSoon: "Coming soon",
    enableFirst: "Turn on first",
    noActiveTab: "No active tab",
    cannotPick: "Cannot Pick",
    unsupported: "This page is not supported",
    queued: "Saved pending",
    currentPageUnavailable: "Page unavailable",
    enabled: "On",
    disabled: "Off",
    settingFailed: "Setting failed",
    pickingOn: "Batch Pick started",
    exited: "Exited",
    chatUnavailable: "No chat detected",
    currentPageCannotInject: "Picker cannot run on this page.",
    protectedPageHint: "Browser internal pages and protected pages cannot run Picker.",
    modePicking: "Batch Picking",
    modeChatSelecting: "Selecting",
    modeReady: "Ready",
    chatDetected: (provider: string, count: number) => `${provider} · ${count} messages`,
    enableOverlayReason: "Turn on the overlay switch first",
    pageUnavailableReason: "Picker cannot run on this page",
    chatUnavailableReason: "No chat messages detected on this page"
  }
}[locale];

let currentMode: PickerMode = "idle";
let isEnabled = false;
let localServiceConnected = false;
let pendingCount = 0;

applyStaticText();
pickerToggle?.addEventListener("click", () => void setPickerEnabled(!isEnabled));
help?.addEventListener("click", () => void openHelp());
pickPage?.addEventListener("click", () => {
  if (showBlockedReason(pickPage)) return;
  void sendToActiveTab({ type: "CAPTURE_PAGE" }, text.pageSaved);
});
startPicking?.addEventListener("click", () => {
  if (showBlockedReason(startPicking)) return;
  void toggleMediaPickMode();
});
selectChatMessages?.addEventListener("click", () => {
  if (showBlockedReason(selectChatMessages)) return;
  void toggleChatPickMode();
});
openInbox?.addEventListener("click", () => {
  if (!localServiceConnected) {
    showInboxDialog();
    return;
  }

  void browser.runtime.sendMessage({ type: "OPEN_INBOX" } satisfies CaptureMessage);
});
savePending?.addEventListener("click", async () => {
  if (showBlockedReason(savePending)) return;
  await browser.runtime.sendMessage({ type: "FLUSH_PENDING" } satisfies CaptureMessage);
  setStatus(text.retriedPending);
  void refreshPickerStatus();
});
dialogDownload?.addEventListener("click", () => void openDownload());
dialogClose?.addEventListener("click", () => hideInboxDialog());

void refreshPickerStatus();

async function sendToActiveTab(message: CaptureMessage, successLabel: string) {
  if (!isEnabled && message.type !== "GET_PICKER_STATUS") {
    setStatus(text.enableFirst);
    return;
  }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus(text.noActiveTab);
    return;
  }

  try {
    const response = (await browser.tabs.sendMessage(tab.id, message)) as CaptureMessageResponse;
    if (response?.status === "error") {
      setStatus(response.message || text.cannotPick);
      return;
    }
    if (response?.status === "unsupported") {
      setStatus(text.unsupported);
      return;
    }
    setStatus(response?.status === "queued" ? text.queued : successLabel);
    void refreshPickerStatus();
    if (message.type === "START_PICK_MODE" || message.type === "START_CHAT_MULTI_PICK") window.close();
  } catch {
    setStatus(text.currentPageUnavailable);
  }
}

async function setPickerEnabled(enabled: boolean) {
  try {
    await browser.runtime.sendMessage({ type: "SET_PICKER_ENABLED", enabled } satisfies CaptureMessage);
    setStatus(enabled ? text.enabled : text.disabled);
    void refreshPickerStatus();
  } catch {
    setStatus(text.settingFailed);
  }
}

async function toggleMediaPickMode() {
  const message: CaptureMessage = currentMode === "pick_mode" ? { type: "CONFIRM_PICK_MODE" } : { type: "START_PICK_MODE" };
  await sendToActiveTab(message, currentMode === "pick_mode" ? text.mediaSaved : text.pickingOn);
}

async function toggleChatPickMode() {
  const message: CaptureMessage = currentMode === "chat_select_mode" ? { type: "CONFIRM_CHAT_MULTI_PICK" } : { type: "START_CHAT_MULTI_PICK" };
  await sendToActiveTab(message, currentMode === "chat_select_mode" ? text.chatSaved : text.selectMessagesPrompt);
}

async function refreshPickerStatus() {
  try {
    const response = (await browser.runtime.sendMessage({ type: "GET_PICKER_STATUS" } satisfies CaptureMessage)) as CaptureMessageResponse;
    if (response?.status !== "picker_status") {
      setUnavailableState();
      return;
    }

    applyPickerStatus(response);
  } catch {
    setUnavailableState();
  }
}

function setStatus(message: string) {
  if (!status) return;
  status.textContent = message;
}

function applyStaticText() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  if (status) status.textContent = text.checking;
  if (help) help.setAttribute("aria-label", text.helpLabel);
  updatePickerToggle();
  const pickToolsTitle = document.querySelector<HTMLElement>(".tools-panel .panel-title strong");
  if (pickToolsTitle) pickToolsTitle.textContent = text.pickTools;
  if (startPicking) setActionLabel(startPicking, text.startContinuousPick);
  if (pickPage) setActionLabel(pickPage, text.pickPage);
  if (selectChatMessages) setActionLabel(selectChatMessages, text.selectMessages);
  const recentTitle = document.querySelector<HTMLElement>(".recent-panel .panel-title strong");
  if (recentTitle) recentTitle.textContent = text.recentPick;
  const empty = recentPicks?.querySelector("p");
  if (empty) empty.textContent = text.noRecent;
  if (openInbox) openInbox.textContent = text.openInbox;
  if (savePending) savePending.textContent = text.saveToInbox;
  const dialogTitle = inboxDialog?.querySelector<HTMLElement>(".dialog strong");
  if (dialogTitle) dialogTitle.textContent = text.inboxDialogTitle;
  const dialogBody = inboxDialog?.querySelector<HTMLElement>(".dialog p");
  if (dialogBody) dialogBody.textContent = text.inboxDialogBody;
  if (dialogDownload) dialogDownload.textContent = text.downloadApp;
  if (dialogClose) dialogClose.textContent = text.dismiss;
}

function applyPickerStatus(response: PickerStatusResponse) {
  currentMode = response.mode;
  isEnabled = response.enabled;
  localServiceConnected = response.localServiceConnected;
  pendingCount = response.pendingCount;
  setStatus(response.enabled ? labelForMode(response.mode, response.pageAvailable) : text.disabled);

  updatePickerToggle();
  if (recentStatus) {
    recentStatus.textContent = text.recentStorageStatus(response.browserStoredCount, response.pendingCapacity, response.pendingCount);
    recentStatus.dataset.warning = String(response.pendingCount > 0);
  }

  if (startPicking) {
    setActionLabel(startPicking, response.mode === "pick_mode" ? text.done : text.startContinuousPick);
    startPicking.dataset.active = String(response.mode === "pick_mode");
  }

  if (selectChatMessages) {
    setActionLabel(selectChatMessages, response.mode === "chat_select_mode" ? text.done : text.selectMessages);
    selectChatMessages.dataset.active = String(response.mode === "chat_select_mode");
  }

  const pageActionEnabled = response.enabled && response.pageAvailable;
  const pageDisabledReason = disabledReasonForPageAction(response);
  setButtonState(pickPage, pageActionEnabled, pageDisabledReason, text.pickPageTip);
  setButtonState(startPicking, pageActionEnabled, pageDisabledReason, text.pickMediaTip);

  const chatEnabled = Boolean(pageActionEnabled && response.chatProvider);
  updateLocalServiceUi(response);
  const chatReason = disabledReasonForChatAction(response, pageDisabledReason);
  setButtonState(selectChatMessages, chatEnabled || response.mode === "chat_select_mode", chatReason, text.pickChatTip);

  renderRecentPicks(response.recentPicks);
}

function setUnavailableState() {
  currentMode = "idle";
  isEnabled = false;
  localServiceConnected = false;
  pendingCount = 0;
  setStatus(text.currentPageUnavailable);
  updatePickerToggle();
  if (recentStatus) {
    recentStatus.textContent = text.recentStorageStatus(0, 30, 0);
    recentStatus.dataset.warning = "false";
  }
  if (startPicking) {
    setActionLabel(startPicking, text.startContinuousPick);
    startPicking.dataset.active = "false";
  }
  if (selectChatMessages) {
    setActionLabel(selectChatMessages, text.selectMessages);
    selectChatMessages.dataset.active = "false";
  }
  setButtonState(pickPage, false, text.pageUnavailableReason, text.pickPageTip);
  setButtonState(startPicking, false, text.pageUnavailableReason, text.pickMediaTip);
  setButtonState(selectChatMessages, false, text.pageUnavailableReason, text.pickChatTip);
  updateInboxDisconnectedButton();
  renderRecentPicks([]);
}

function labelForMode(mode: PickerMode, pageAvailable: boolean): string {
  if (!pageAvailable) return text.currentPageUnavailable;
  if (mode === "pick_mode") return text.modePicking;
  if (mode === "chat_select_mode") return text.modeChatSelecting;
  return text.modeReady;
}

function updatePickerToggle() {
  if (!pickerToggle) return;
  pickerToggle.textContent = isEnabled ? text.overlayOn : text.overlayOff;
  pickerToggle.setAttribute("aria-label", isEnabled ? text.overlayOnLabel : text.overlayOffLabel);
  pickerToggle.setAttribute("aria-pressed", String(isEnabled));
  pickerToggle.dataset.active = String(isEnabled);
}

function disabledReasonForPageAction(response: PickerStatusResponse): string {
  if (!response.enabled) return text.enableOverlayReason;
  if (!response.pageAvailable) return text.pageUnavailableReason;
  return "";
}

function disabledReasonForChatAction(response: PickerStatusResponse, pageDisabledReason: string): string {
  if (pageDisabledReason) return pageDisabledReason;
  if (!response.chatProvider) return text.chatUnavailableReason;
  return "";
}

function setButtonState(button: HTMLButtonElement | null, enabled: boolean, reason = "", enabledTip = "") {
  if (!button) return;
  button.setAttribute("aria-disabled", String(!enabled));
  button.dataset.disabled = String(!enabled);
  button.title = enabled ? enabledTip : [reason, enabledTip].filter(Boolean).join(" ");
}

function showBlockedReason(button: HTMLButtonElement | null): boolean {
  if (!button || button.dataset.disabled !== "true") return false;
  return true;
}

function updateLocalServiceUi(response: PickerStatusResponse) {
  if (response.localServiceConnected) {
    if (savePending) {
      savePending.hidden = false;
      savePending.textContent = text.saveToInbox;
      setButtonState(savePending, response.pendingCount > 0, text.savedPendingDisabled);
    }
    if (openInbox) {
      openInbox.removeAttribute("aria-disabled");
      openInbox.dataset.disabled = "false";
      openInbox.title = "";
      openInbox.classList.remove("disconnected");
      openInbox.innerHTML = text.openInbox;
    }
    return;
  }

  updateInboxDisconnectedButton();
}

function updateInboxDisconnectedButton() {
  if (savePending) savePending.hidden = true;
  if (!openInbox) return;
  openInbox.removeAttribute("aria-disabled");
  openInbox.dataset.disabled = "false";
  openInbox.title = text.disconnectedInboxHint;
  openInbox.classList.add("disconnected");
  openInbox.innerHTML = disconnectedInboxMarkup();
}

function disconnectedInboxMarkup(): string {
  return `
    <span class="inbox-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M10 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8" />
        <path d="M14 12H3" />
        <path d="m6 9-3 3 3 3" />
      </svg>
    </span>
    <span>${text.disconnectedInbox}</span>
  `;
}

function showInboxDialog() {
  if (inboxDialog) inboxDialog.hidden = false;
}

function hideInboxDialog() {
  if (inboxDialog) inboxDialog.hidden = true;
}

async function openHelp() {
  setStatus(text.helpHint);
  await browser.tabs.create({ url: HELP_URL });
}

async function openDownload() {
  setStatus(text.downloadHint);
  await browser.tabs.create({ url: DOWNLOAD_URL });
}

function renderRecentPicks(items: RecentPickSummary[]) {
  if (!recentPicks) return;

  recentPicks.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.textContent = text.noRecent;
    recentPicks.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = item.thumbnailUrl ? "recent-item" : "recent-item no-image";

    if (item.thumbnailUrl) {
      const image = document.createElement("img");
      image.src = item.thumbnailUrl;
      image.alt = "";
      row.append(image);
    }

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("small");
    meta.textContent = [item.modality, item.status, hostLabel(item.sourceOrigin)].filter(Boolean).join(" · ");
    const preview = document.createElement("p");
    preview.textContent = item.previewText || "";
    body.append(title, meta);
    if (item.previewText) body.append(preview);
    row.append(body);

    recentPicks.append(row);
  }
}

function hostLabel(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function setActionLabel(button: HTMLButtonElement, value: string) {
  const label = button.querySelector<HTMLElement>(".button-label");
  if (label) {
    label.textContent = value;
    return;
  }

  button.textContent = value;
}
