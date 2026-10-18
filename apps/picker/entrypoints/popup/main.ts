import { browser } from "wxt/browser";
import { PICKER_LANGUAGE_KEY, storedPickerLanguage } from "../../src/shared/i18n";
import { PICKER_OVERLAY_POSITION_KEY, storedPickerOverlayPosition, type PickerOverlayPosition } from "../../src/shared/overlay-position";
import { formatLocalDateTime } from "../../src/shared/datetime";
import type { PickerMessage, PickerMessageResponse, PickerBook, PickerMode, PickerStatusResponse, RecentPickSummary } from "../../src/shared/types";
import "./style.css";

const status = document.querySelector<HTMLSpanElement>("#status");
const pickerContent = document.querySelector<HTMLElement>("#picker-content");
const connectionGate = document.querySelector<HTMLElement>("#connection-gate");
const connectionStatus = document.querySelector<HTMLParagraphElement>("#connection-status");
const connectionRefresh = document.querySelector<HTMLButtonElement>("#connection-refresh");
const connectionDownload = document.querySelector<HTMLButtonElement>("#connection-download");
const pickerToggle = document.querySelector<HTMLButtonElement>("#picker-toggle");
const pickerToggleLabel = document.querySelector<HTMLSpanElement>("#picker-toggle-label");
const settingsMenu = document.querySelector<HTMLElement>("#settings-menu");
const settingsToggle = document.querySelector<HTMLButtonElement>("#settings-toggle");
const settingsPopover = document.querySelector<HTMLElement>("#settings-popover");
const settingsHelp = document.querySelector<HTMLButtonElement>("#settings-help");
const settingsFeedback = document.querySelector<HTMLButtonElement>("#settings-feedback");
const settingsLanguage = document.querySelector<HTMLButtonElement>("#settings-language");
const settingsPositionLabel = document.querySelector<HTMLElement>("#settings-position-label");
const settingsPositionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-picker-position]"));
const pickPage = document.querySelector<HTMLButtonElement>("#pick-page");
const startPicking = document.querySelector<HTMLButtonElement>("#start-picking");
const selectChatMessages = document.querySelector<HTMLButtonElement>("#select-chat-messages");
const openSources = document.querySelector<HTMLButtonElement>("#open-sources");
const recentPicks = document.querySelector<HTMLDivElement>("#recent-picks");
const bookControl = document.querySelector<HTMLElement>("#book-control");
const bookToggle = document.querySelector<HTMLButtonElement>("#book-toggle");
const bookName = document.querySelector<HTMLElement>("#book-name");
const bookMenu = document.querySelector<HTMLElement>("#book-menu");

type Locale = "zh" | "en";
let locale: Locale = storedPickerLanguage(window.localStorage.getItem(PICKER_LANGUAGE_KEY));
let overlayPosition: PickerOverlayPosition = storedPickerOverlayPosition(window.localStorage.getItem(PICKER_OVERLAY_POSITION_KEY));
const HELP_URL = "https://github.com/Yanze-He/sourcebook-for-agents#readme";
const FEEDBACK_URL = "https://github.com/Yanze-He/sourcebook-for-agents/issues/new/choose";
const DOWNLOAD_URL = "https://github.com/Yanze-He/sourcebook-for-agents/releases";
const copy = {
  zh: {
    checking: "正在检查 Picker 状态",
    overlayOn: "Picker 已开启",
    overlayOff: "Picker 已关闭",
    overlayOnLabel: "关闭 Picker",
    overlayOffLabel: "打开 Picker",
    downloadApp: "下载桌面应用",
    settings: "设置",
    help: "帮助",
    feedback: "反馈",
    overlayPosition: "浮层位置",
    topRight: "右上",
    bottomRight: "右下",
    bottomLeft: "左下",
    topLeft: "左上",
    switchLanguage: "English",
    helpLabel: "打开帮助文档",
    helpHint: "Picker 正在打开帮助文档。",
    openSources: "打开 Sourcebook",
    chooseBook: "选择保存 Book",
    defaultSaveTo: "默认保存至：",
    book: "Book",
    currentBook: "当前 Book",
    startContinuousPick: "Pick 媒体",
    done: "完成",
    pickPage: "Pick 网页",
    pickPost: "Pick 帖子",
    selectMessages: "Pick 对话",
    cancel: "取消",
    pickPageTip: "保存当前网页的标题、URL、来源信息和描述摘要。",
    pickPostTip: "保存当前帖子的正文、作者、发布时间和媒体信息。",
    pickMediaTip: "连续选择图片、视频、链接等媒体资源，确认后保存。",
    pickChatTip: "选择多条 Agent 对话，合并保存为一个上下文片段。",
    mediaSupportHelp: "支持 PNG、JPEG、GIF、WebP 图片；视频和音频仅保存为链接。",
    chatSupportHelp: "支持 ChatGPT、Gemini、DeepSeek 和 Grok。",
    recentPick: "最近 Pick",
    recentLimit: "只显示最近 5 条",
    noRecent: "还没有最近内容。",
    pageSaved: "Picker 已保存当前网页",
    postSaved: "Picker 已保存当前帖子",
    chatSaved: "Picker 已保存所选对话",
    mediaSaved: "Picker 已保存所选媒体",
    selectMessagesPrompt: "Picker 已进入对话选择模式",
    comingSoon: "暂未开放",
    enableFirst: "请先开启 Picker 再继续",
    noActiveTab: "Picker 未找到当前页面",
    cannotPick: "Picker 无法保存当前内容",
    unsupported: "Picker 不支持当前页面",
    connectionTitle: "Sourcebook Desktop 未连接",
    connectionBody: "请先启动 Sourcebook Desktop，等待它打开后，再点击“重新连接”。",
    refreshConnection: "重新连接",
    refreshingConnection: "正在重新连接…",
    refreshFailed: (time: string) => `${time} 重新连接失败。请启动 Desktop 后再试。`,
    currentPageUnavailable: "Picker 无法在当前页面使用",
    enabled: "Picker 已开启",
    disabled: "Picker 已关闭",
    settingFailed: "Picker 设置更新失败，请重试",
    pickingOn: "Picker 已进入媒体选择模式",
    exited: "Picker 已退出选择模式",
    chatUnavailable: "Picker 未识别出当前页面的对话",
    currentPageCannotInject: "当前页面无法注入 Picker。",
    protectedPageHint: "浏览器内部页或受保护页面无法注入 Picker。",
    modePicking: "Picker 正在选择媒体",
    modeChatSelecting: "Picker 正在选择对话",
    modeReady: "Picker 已就绪",
    chatDetected: (provider: string, count: number) => `${provider} · ${count} 条消息`,
    enableOverlayReason: "请先开启右上角的 Picker 开关",
    pageUnavailableReason: "Picker 无法在当前页面使用",
    chatUnavailableReason: "Picker 未识别出当前页面的聊天消息"
  },
  en: {
    checking: "Checking Picker status",
    overlayOn: "Picker is on",
    overlayOff: "Picker is off",
    overlayOnLabel: "Turn off Picker",
    overlayOffLabel: "Turn on Picker",
    downloadApp: "Download app",
    settings: "Settings",
    help: "Help",
    feedback: "Feedback",
    overlayPosition: "Overlay position",
    topRight: "Top right",
    bottomRight: "Bottom right",
    bottomLeft: "Bottom left",
    topLeft: "Top left",
    switchLanguage: "中文",
    helpLabel: "Open help docs",
    helpHint: "Picker is opening help documentation.",
    openSources: "Open Sourcebook",
    chooseBook: "Choose a Book",
    defaultSaveTo: "Save picks to:",
    book: "Book",
    currentBook: "Current Book",
    startContinuousPick: "Pick media",
    done: "Done",
    pickPage: "Pick page",
    pickPost: "Pick post",
    selectMessages: "Pick chat",
    cancel: "Cancel",
    pickPageTip: "Save this page title, URL, source information, and summary.",
    pickPostTip: "Save the current post text, author, date, and media details.",
    pickMediaTip: "Select images, videos, and links in sequence, then confirm to save.",
    pickChatTip: "Select multiple agent messages and save them as one context fragment.",
    mediaSupportHelp: "Supports PNG, JPEG, GIF, and WebP images. Video and audio are saved as links only.",
    chatSupportHelp: "Supports ChatGPT, Gemini, DeepSeek, and Grok.",
    recentPick: "Recent Picks",
    recentLimit: "Latest 5 only",
    noRecent: "No recent picks yet.",
    pageSaved: "Picker saved this page",
    postSaved: "Picker saved this post",
    chatSaved: "Picker saved the selected chat",
    mediaSaved: "Picker saved the selected media",
    selectMessagesPrompt: "Picker is ready to select chat messages",
    comingSoon: "Coming soon",
    enableFirst: "Turn on Picker before continuing",
    noActiveTab: "Picker could not find an active page",
    cannotPick: "Picker could not save this content",
    unsupported: "Picker does not support this page",
    connectionTitle: "Sourcebook Desktop is not connected",
    connectionBody: "Start Sourcebook Desktop, wait for it to open, then click Reconnect.",
    refreshConnection: "Reconnect",
    refreshingConnection: "Reconnecting…",
    refreshFailed: (time: string) => `${time} · Reconnect failed. Start Desktop, then try again.`,
    currentPageUnavailable: "Picker is not available on this page",
    enabled: "Picker is on",
    disabled: "Picker is off",
    settingFailed: "Picker settings could not be updated. Try again.",
    pickingOn: "Picker is ready to select media",
    exited: "Picker exited selection mode",
    chatUnavailable: "Picker could not detect chat messages on this page",
    currentPageCannotInject: "Picker cannot run on this page.",
    protectedPageHint: "Browser internal pages and protected pages cannot run Picker.",
    modePicking: "Picker is selecting media",
    modeChatSelecting: "Picker is selecting chat messages",
    modeReady: "Picker is ready",
    chatDetected: (provider: string, count: number) => `${provider} · ${count} messages`,
    enableOverlayReason: "Turn on Picker before using this action",
    pageUnavailableReason: "Picker cannot run on this page",
    chatUnavailableReason: "Picker could not detect chat messages on this page"
  }
} as const;
let text = copy[locale];

let currentMode: PickerMode = "idle";
let isEnabled = false;
let localServiceConnected = false;
let pickerAttentionTimer: number | undefined;
let lastConnectionRefresh: Date | undefined;
let connectionRefreshFailed = false;
let currentPostPlatform: PickerStatusResponse["postPlatform"];

applyStaticText();
void browser.storage.local.set({ [PICKER_LANGUAGE_KEY]: locale });
pickerToggle?.addEventListener("click", () => void setPickerEnabled(!isEnabled));
settingsToggle?.addEventListener("click", (event) => { event.stopPropagation(); toggleSettings(); });
settingsMenu?.addEventListener("click", (event) => event.stopPropagation());
settingsHelp?.addEventListener("click", () => void openHelp());
settingsFeedback?.addEventListener("click", () => void openFeedback());
settingsLanguage?.addEventListener("click", () => switchLanguage());
settingsPositionButtons.forEach((button) => button.addEventListener("click", () => setOverlayPosition(storedPickerOverlayPosition(button.dataset.pickerPosition))));
pickPage?.addEventListener("click", () => {
  if (showBlockedReason(pickPage)) return;
  void sendToActiveTab({ type: "PICK_PAGE" }, currentPostPlatform ? text.postSaved : text.pageSaved);
});
startPicking?.addEventListener("click", () => {
  if (showBlockedReason(startPicking)) return;
  void toggleMediaPickMode();
});
selectChatMessages?.addEventListener("click", () => {
  if (showBlockedReason(selectChatMessages)) return;
  void toggleChatPickMode();
});
openSources?.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "OPEN_SOURCES" } satisfies PickerMessage);
});
connectionRefresh?.addEventListener("click", () => void refreshPickerStatus(true));
connectionDownload?.addEventListener("click", () => void openDownload());
bookToggle?.addEventListener("click", (event) => { event.stopPropagation(); toggleBooks(); });
bookControl?.addEventListener("click", (event) => event.stopPropagation());

void refreshPickerStatus();
window.addEventListener("focus", () => void refreshPickerStatus());

document.addEventListener("click", (event) => {
  if (!settingsMenu?.contains(event.target as Node)) closeSettings();
  if (!bookControl?.contains(event.target as Node)) closeBooks();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeSettings(); closeBooks(); }
});

async function sendToActiveTab(message: PickerMessage, successLabel: string) {
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
    const response = (await browser.tabs.sendMessage(tab.id, message)) as PickerMessageResponse;
    if (response?.status === "error") {
      setStatus(response.message || text.cannotPick);
      return;
    }
    if (response?.status === "unsupported") {
      setStatus(text.unsupported);
      return;
    }
    setStatus(successLabel);
    void refreshPickerStatus();
    if (message.type === "START_PICK_MODE" || message.type === "START_CHAT_MULTI_PICK") window.close();
  } catch {
    setStatus(text.currentPageUnavailable);
  }
}

async function setPickerEnabled(enabled: boolean) {
  try {
    await browser.runtime.sendMessage({ type: "SET_PICKER_ENABLED", enabled } satisfies PickerMessage);
    isEnabled = enabled;
    if (!enabled) {
      currentMode = "idle";
      updatePickerToggle();
      if (startPicking) {
        setActionLabel(startPicking, text.startContinuousPick);
        startPicking.dataset.active = "false";
      }
      if (selectChatMessages) {
        setActionLabel(selectChatMessages, text.selectMessages);
        selectChatMessages.dataset.active = "false";
      }
      setButtonState(startPicking, false, text.enableOverlayReason, text.mediaSupportHelp);
      setButtonState(selectChatMessages, false, text.enableOverlayReason, text.chatSupportHelp);
    }
    setStatus(enabled ? text.enabled : text.disabled);
    await refreshPickerStatus();
  } catch {
    setStatus(text.settingFailed);
  }
}

async function toggleMediaPickMode() {
  const cancelling = currentMode === "pick_mode";
  const message: PickerMessage = cancelling ? { type: "STOP_PICK_MODE" } : { type: "START_PICK_MODE" };
  await sendToActiveTab(message, cancelling ? text.exited : text.pickingOn);
}

async function toggleChatPickMode() {
  const cancelling = currentMode === "chat_select_mode";
  const message: PickerMessage = cancelling ? { type: "CANCEL_CHAT_MULTI_PICK" } : { type: "START_CHAT_MULTI_PICK" };
  await sendToActiveTab(message, cancelling ? text.exited : text.selectMessagesPrompt);
}

async function refreshPickerStatus(reportConnectionAttempt = false) {
  if (reportConnectionAttempt) setConnectionRefreshState("checking");

  try {
    const response = (await browser.runtime.sendMessage({ type: "GET_PICKER_STATUS" } satisfies PickerMessage)) as PickerMessageResponse;
    if (response?.status !== "picker_status") {
      setUnavailableState(reportConnectionAttempt);
      return;
    }

    applyPickerStatus(response);
    if (!response.localServiceConnected && reportConnectionAttempt) setConnectionRefreshState("failed");
  } catch {
    setUnavailableState(reportConnectionAttempt);
  }
}

function setStatus(message: string) {
  if (!status) return;
  status.textContent = message;
}

function applyStaticText() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  if (status) status.textContent = text.checking;
  if (settingsToggle) {
    settingsToggle.setAttribute("aria-label", text.settings);
    settingsToggle.title = text.settings;
  }
  if (settingsHelp) settingsHelp.textContent = text.help;
  if (settingsFeedback) settingsFeedback.textContent = text.feedback;
  if (settingsLanguage) settingsLanguage.textContent = text.switchLanguage;
  if (settingsPositionLabel) settingsPositionLabel.textContent = text.overlayPosition;
  renderOverlayPosition();
  if (bookToggle) bookToggle.setAttribute("aria-label", text.currentBook);
  const bookLabel = document.querySelector<HTMLElement>(".book-switcher-label");
  if (bookLabel) bookLabel.textContent = text.defaultSaveTo;
  updatePickerToggle();
  if (startPicking) setActionLabel(startPicking, text.startContinuousPick);
  if (pickPage) setActionLabel(pickPage, text.pickPage);
  if (selectChatMessages) setActionLabel(selectChatMessages, text.selectMessages);
  const recentTitle = document.querySelector<HTMLElement>(".recent-panel .panel-title strong");
  if (recentTitle) recentTitle.textContent = text.recentPick;
  const recentLimit = document.querySelector<HTMLElement>(".recent-limit");
  if (recentLimit) recentLimit.textContent = text.recentLimit;
  const empty = recentPicks?.querySelector("p");
  if (empty) empty.textContent = text.noRecent;
  if (openSources) setActionLabel(openSources, text.openSources);
  const connectionTitle = connectionGate?.querySelector<HTMLElement>("strong");
  if (connectionTitle) connectionTitle.textContent = text.connectionTitle;
  const connectionBody = connectionGate?.querySelector<HTMLParagraphElement>("p");
  if (connectionBody) connectionBody.textContent = text.connectionBody;
  if (connectionRefresh) connectionRefresh.textContent = text.refreshConnection;
  if (connectionDownload) connectionDownload.textContent = text.downloadApp;
  if (connectionStatus && connectionRefreshFailed && lastConnectionRefresh) {
    connectionStatus.textContent = text.refreshFailed(formatConnectionRefreshTime(lastConnectionRefresh));
  }
}

function applyPickerStatus(response: PickerStatusResponse) {
  currentMode = response.mode;
  isEnabled = response.enabled;
  localServiceConnected = response.localServiceConnected;
  currentPostPlatform = response.postPlatform;
  setConnectionGate(!response.localServiceConnected);
  if (response.localServiceConnected) {
    connectionRefreshFailed = false;
    lastConnectionRefresh = undefined;
    if (connectionStatus) connectionStatus.textContent = "";
    if (connectionRefresh) {
      connectionRefresh.disabled = false;
      connectionRefresh.textContent = text.refreshConnection;
    }
  }
  if (!response.localServiceConnected) {
    closeBooks();
    return;
  }
  setStatus(response.enabled ? labelForMode(response.mode, response.pageAvailable) : text.disabled);

  updatePickerToggle();

  if (startPicking) {
    setActionLabel(startPicking, response.mode === "pick_mode" ? text.cancel : text.startContinuousPick);
    startPicking.dataset.active = String(response.mode === "pick_mode");
  }

  if (selectChatMessages) {
    setActionLabel(selectChatMessages, response.mode === "chat_select_mode" ? text.cancel : text.selectMessages);
    selectChatMessages.dataset.active = String(response.mode === "chat_select_mode");
  }

  const pageActionEnabled = response.enabled && response.pageAvailable;
  const pageDisabledReason = disabledReasonForPageAction(response);
  const pageActionLabel = response.postPlatform ? text.pickPost : text.pickPage;
  const pageActionTip = response.postPlatform ? text.pickPostTip : text.pickPageTip;
  if (pickPage) setActionLabel(pickPage, pageActionLabel);
  setButtonState(pickPage, pageActionEnabled, pageDisabledReason, pageActionTip);
  setButtonState(startPicking, pageActionEnabled, pageDisabledReason, text.mediaSupportHelp);

  const chatEnabled = Boolean(pageActionEnabled && response.chatProvider);
  const chatReason = disabledReasonForChatAction(response, pageDisabledReason);
  setButtonState(selectChatMessages, chatEnabled || response.mode === "chat_select_mode", chatReason, text.chatSupportHelp);

  renderRecentPicks(response.recentPicks);
  renderBooks(response.books ?? [], response.activeBookId, !response.activeBookId);
}

function setUnavailableState(reportConnectionAttempt = false) {
  currentMode = "idle";
  isEnabled = false;
  localServiceConnected = false;
  setConnectionGate(true);
  if (reportConnectionAttempt) setConnectionRefreshState("failed");
  closeBooks();
}

function setConnectionRefreshState(state: "checking" | "failed") {
  if (!connectionStatus || !connectionRefresh) return;

  if (state === "checking") {
    connectionRefresh.disabled = true;
    connectionRefresh.textContent = text.refreshingConnection;
    connectionStatus.textContent = text.refreshingConnection;
    return;
  }

  lastConnectionRefresh = new Date();
  connectionRefreshFailed = true;
  connectionRefresh.disabled = false;
  connectionRefresh.textContent = text.refreshConnection;
  connectionStatus.textContent = text.refreshFailed(formatConnectionRefreshTime(lastConnectionRefresh));
}

function formatConnectionRefreshTime(value: Date): string {
  return formatLocalDateTime(value);
}

function setConnectionGate(disconnected: boolean) {
  if (pickerContent) pickerContent.hidden = disconnected;
  if (connectionGate) connectionGate.hidden = !disconnected;
}

function renderBooks(books: PickerBook[], activeBookId?: string, needsSelection = false) {
  if (!bookControl || !bookToggle || !bookName || !bookMenu) return;
  bookControl.hidden = !books.length;
  if (!books.length) return;
  const activeBook = books.find((book) => book.id === activeBookId);
  bookName.textContent = activeBook?.name || text.chooseBook;
  bookToggle.disabled = books.length === 1 && !needsSelection;
  const options = books.map((book) => {
    const option = document.createElement("button");
    option.type = "button";
    option.role = "menuitem";
    option.setAttribute("aria-pressed", String(book.id === activeBookId));
    const label = document.createElement("span");
    label.textContent = book.name;
    option.append(label);
    if (book.id === activeBookId) {
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      check.setAttribute("viewBox", "0 0 24 24");
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = '<path d="m5 12 4.2 4.2L19 6.5" />';
      option.append(check);
    }
    option.addEventListener("click", () => void selectBook(book.id));
    return option;
  });
  bookMenu.replaceChildren(...options);
}

function toggleBooks() {
  closeSettings();
  const willOpen = bookMenu?.hidden !== false;
  if (bookMenu) bookMenu.hidden = !willOpen;
  bookToggle?.classList.toggle("is-open", willOpen);
  bookToggle?.setAttribute("aria-expanded", String(willOpen));
}

function closeBooks() {
  if (bookMenu) bookMenu.hidden = true;
  bookToggle?.classList.remove("is-open");
  bookToggle?.setAttribute("aria-expanded", "false");
}

async function selectBook(bookId: string) {
  const response = await browser.runtime.sendMessage({ type: "SET_ACTIVE_BOOK", bookId } satisfies PickerMessage) as PickerMessageResponse;
  if (response?.status === "error") setStatus(response.message);
  else { closeBooks(); void refreshPickerStatus(); }
}

function labelForMode(mode: PickerMode, pageAvailable: boolean): string {
  if (!pageAvailable) return text.currentPageUnavailable;
  if (mode === "pick_mode") return text.modePicking;
  if (mode === "chat_select_mode") return text.modeChatSelecting;
  return text.modeReady;
}

function updatePickerToggle() {
  if (!pickerToggle) return;
  if (pickerToggleLabel) pickerToggleLabel.textContent = isEnabled ? text.overlayOn : text.overlayOff;
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
  button.dataset.blockedReason = reason;
  const tooltip = button.parentElement?.querySelector<HTMLElement>(".action-tooltip");
  const message = enabled ? enabledTip : [reason, enabledTip].filter(Boolean).join("\n");
  if (tooltip) {
    button.removeAttribute("title");
    tooltip.textContent = message;
    button.setAttribute("aria-describedby", tooltip.id);
  } else {
    button.title = message;
  }
}

function showBlockedReason(button: HTMLButtonElement | null): boolean {
  if (!button || button.dataset.disabled !== "true") return false;
  const reason = button.dataset.blockedReason || text.enableFirst;
  setStatus(reason);
  if (!isEnabled) {
    window.clearTimeout(pickerAttentionTimer);
    pickerToggle?.classList.add("needs-attention");
    pickerAttentionTimer = window.setTimeout(() => pickerToggle?.classList.remove("needs-attention"), 1200);
  }
  return true;
}

async function openHelp() {
  closeSettings();
  setStatus(text.helpHint);
  await browser.tabs.create({ url: HELP_URL });
}

async function openFeedback() {
  closeSettings();
  await browser.tabs.create({ url: FEEDBACK_URL });
}

function toggleSettings() {
  closeBooks();
  const willOpen = settingsPopover?.hidden !== false;
  if (settingsPopover) settingsPopover.hidden = !willOpen;
  settingsToggle?.setAttribute("aria-expanded", String(willOpen));
}

function closeSettings() {
  if (settingsPopover) settingsPopover.hidden = true;
  settingsToggle?.setAttribute("aria-expanded", "false");
}

function switchLanguage() {
  locale = locale === "zh" ? "en" : "zh";
  window.localStorage.setItem(PICKER_LANGUAGE_KEY, locale);
  void browser.storage.local.set({ [PICKER_LANGUAGE_KEY]: locale });
  text = copy[locale];
  closeSettings();
  applyStaticText();
  void refreshPickerStatus();
}

function setOverlayPosition(position: PickerOverlayPosition) {
  overlayPosition = position;
  window.localStorage.setItem(PICKER_OVERLAY_POSITION_KEY, position);
  void browser.storage.local.set({ [PICKER_OVERLAY_POSITION_KEY]: position });
  renderOverlayPosition();
}

function renderOverlayPosition() {
  const labels: Record<PickerOverlayPosition, string> = {
    "top-right": text.topRight,
    "bottom-right": text.bottomRight,
    "bottom-left": text.bottomLeft,
    "top-left": text.topLeft,
  };
  settingsPositionButtons.forEach((button) => {
    const position = storedPickerOverlayPosition(button.dataset.pickerPosition);
    const active = position === overlayPosition;
    const label = labels[position];
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);
    button.title = label;
  });
}

async function openDownload() {
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

  for (const item of items.slice(0, 5)) {
    const row = document.createElement("article");
    row.className = "recent-item";

    const usesFavicon = item.modality === "link" || item.modality === "conversation";
    const previewUrl = usesFavicon ? item.faviconUrl : item.thumbnailUrl;
    const preview = document.createElement(previewUrl ? "img" : "span");
    preview.className = previewUrl
      ? `recent-preview${usesFavicon ? " is-favicon" : ""}`
      : "recent-preview is-fallback";
    if (preview instanceof HTMLImageElement && previewUrl) {
      preview.src = previewUrl;
      preview.alt = "";
      preview.addEventListener("error", () => preview.replaceWith(createRecentFallback(item.modality)));
    } else {
      preview.textContent = recentFallbackLabel(item.modality);
    }

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("small");
    meta.textContent = [hostLabel(item.sourceOrigin), pickedTimeLabel(item.pickedAt)].filter(Boolean).join(" · ");
    body.append(title, meta);
    row.append(preview, body);

    recentPicks.append(row);
  }
}

function createRecentFallback(modality: RecentPickSummary["modality"]): HTMLElement {
  const fallback = document.createElement("span");
  fallback.className = "recent-preview is-fallback";
  fallback.textContent = recentFallbackLabel(modality);
  return fallback;
}

function recentFallbackLabel(modality: RecentPickSummary["modality"]): string {
  return ({ image: "IMG", video: "VID", audio: "AUD", conversation: "CHAT", link: "LINK", post: "POST", text: "TXT" } as const)[modality];
}

function hostLabel(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function pickedTimeLabel(value: string): string {
  return formatLocalDateTime(value);
}

function setActionLabel(button: HTMLButtonElement, value: string) {
  const label = button.querySelector<HTMLElement>(".button-label");
  if (label) {
    label.textContent = value;
    return;
  }

  button.textContent = value;
}
