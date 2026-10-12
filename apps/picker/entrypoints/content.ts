import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { chatMessageElement, extractChatMessageFromElement, extractVisibleChat } from "../src/chat/adapters";
import { detectChatProvider, providerLabel } from "../src/chat/recognizer";
import { buildConversationPick, transcriptFromMessages } from "../src/chat/transcript";
import { PICKER_LANGUAGE_KEY, storedPickerLanguage, type UiLanguage } from "../src/shared/i18n";
import { DEFAULT_PICKER_OVERLAY_POSITION, PICKER_OVERLAY_POSITION_KEY, storedPickerOverlayPosition, type PickerOverlayPosition } from "../src/shared/overlay-position";
import { collectPageMetadata, getFaviconUrl, getPageTitle, getSourceOrigin } from "../src/shared/page";
import { cssPath, isEditableTarget, isSensitivePage, quoteWithContext, textPositionInBody } from "../src/shared/selector";
import { truncatePickTitle } from "../src/shared/title";
import type { PickerMessage, PickerMessageResponse, PickResponse, ChatMessageCandidate, ChatProvider, PickerMode, PickPayload } from "../src/shared/types";
import { tldrawImageAtPoint } from "../src/canvas/tldraw";

type RectLike = Pick<DOMRect, "top" | "left" | "width" | "height">;
type HoverPickTarget =
  | { kind: "image"; element: HTMLImageElement }
  | { kind: "video"; element: HTMLVideoElement }
  | { kind: "audio"; element: HTMLAudioElement }
  | { kind: "chat"; element: HTMLElement; message: ChatMessageCandidate };

type StagedPick = {
  key: string;
  target: HoverPickTarget;
  payload: PickPayload;
  rects: RectLike[];
  label: string;
};

type PickTask = {
  element: HTMLElement;
  payload: PickPayload;
  sourceItemId?: string;
  sourceBookId?: string;
  dismissTimer?: number;
  dismissalBound?: boolean;
};

type ToastTask = {
  element: HTMLElement;
  dismissTimer?: number;
  dismissalBound?: boolean;
};

const PICKER_ENABLED_KEY = "pickerEnabled";
const copy = {
  zh: {
    pick: "Pick",
    pickMessage: "Pick message",
    pickImage: "Pick 图片",
    pickVideo: "Pick 视频",
    pickAudio: "Pick 音频",
    unsupportedContent: "这个内容暂时不能 Pick。",
    alreadyStaged: "已在待确认列表中",
    noSelection: "没有可 Pick 的选中文本。",
    invalidSelection: "这段内容不能 Pick。",
    noContent: "没有可 Pick 的内容。",
    enablePicker: "请先在插件窗口开启 Picker。",
    noMessage: "没有可 Pick 的消息。",
    selectedCount: (count: number) => `已选择 ${count} 个`,
    pickMediaMode: "Pick 媒体",
    pickChatMode: "Pick 对话",
    pickModeTitle: "移动鼠标选择图片、视频或链接",
    confirmPick: "确定",
    confirmCount: (_count: number) => "确定",
    clear: "清空",
    done: "完成",
    pickPage: "Pick 页面",
    chooseFirst: "请先点击一个可 Pick 的内容。",
    duplicateOne: "已在 Sources 中",
    duplicateMany: (count: number) => `${count} 个已在 Sources 中`,
    savedOne: "已保存到 Sources",
    savedMany: (count: number) => `已保存 ${count} 个到 Sources`,
    chatUnsupported: "当前页面还不支持聊天 Pick。",
    noLoadedMessages: "没有找到已加载的聊天消息。",
    noChatSource: "没有识别到聊天来源。",
    invalidChatMessages: "无法可靠识别消息边界，请重新选择消息。",
    selectMessage: "选择消息",
    selectMessagesTitle: (provider: string) => `${provider} · 选择消息`,
    selectedMessagesCount: (count: number) => `已选择 ${count} 条`,
    pickSelected: "确定",
    pickVisible: "选择所有已加载对话",
    retry: "重试",
    saving: "正在保存到 Sourcebook",
    downloading: "正在下载图片",
    imageDownloadFailed: "图片下载失败。",
    saved: "已保存到 Sourcebook",
    books: "保存到",
    newBook: "新增",
    newBookPlaceholder: "新 Book 名称",
    confirmBook: "确认",
    view: "查看",
    moveFailed: "无法更改 Book",
    addNote: "添加备注",
    openSources: "打开 Sourcebook",
    addNotePlaceholder: "添加备注...",
    addNoteAria: "为这个 Pick 添加备注",
    save: "保存",
    cancel: "取消",
    noteCancelled: "已取消 Note",
    noteSaved: "Note 已保存"
  },
  en: {
    pick: "Pick",
    pickMessage: "Pick message",
    pickImage: "Pick image",
    pickVideo: "Pick video",
    pickAudio: "Pick audio",
    unsupportedContent: "This content cannot be picked yet.",
    alreadyStaged: "Already selected",
    noSelection: "No selected text to Pick.",
    invalidSelection: "This text cannot be picked.",
    noContent: "No Pickable content found.",
    enablePicker: "Turn on Picker in the extension popup first.",
    noMessage: "No message to Pick.",
    selectedCount: (count: number) => `${count} selected`,
    pickMediaMode: "Pick media",
    pickChatMode: "Pick chat",
    pickModeTitle: "Move over images, videos, or links",
    confirmPick: "Confirm",
    confirmCount: (_count: number) => "Confirm",
    clear: "Clear",
    done: "Done",
    pickPage: "Pick page",
    chooseFirst: "Click Pickable content first.",
    duplicateOne: "Already in Sources",
    duplicateMany: (count: number) => `${count} already in Sources`,
    savedOne: "Saved to Sources",
    savedMany: (count: number) => `${count} saved to Sources`,
    chatUnsupported: "Chat Pick is not supported on this page yet.",
    noLoadedMessages: "No loaded chat messages found.",
    noChatSource: "Chat source was not detected.",
    invalidChatMessages: "Message boundaries could not be identified reliably. Select the messages again.",
    selectMessage: "Select message",
    selectMessagesTitle: (provider: string) => `${provider} · Select messages`,
    selectedMessagesCount: (count: number) => `${count} selected`,
    pickSelected: "Confirm",
    pickVisible: "Select all loaded chats",
    retry: "Retry",
    saving: "Saving to Sourcebook",
    downloading: "Downloading image",
    imageDownloadFailed: "Image download failed.",
    saved: "Saved to Sourcebook",
    books: "Save to",
    newBook: "New",
    newBookPlaceholder: "New Book name",
    confirmBook: "Done",
    view: "View",
    moveFailed: "Could not change Book",
    addNote: "Add note",
    openSources: "Open Sources",
    addNotePlaceholder: "Add note...",
    addNoteAria: "Add note to this Pick",
    save: "Save",
    cancel: "Cancel",
    noteCancelled: "Note cancelled",
    noteSaved: "Note saved"
  }
};
let locale: UiLanguage = "en";
let text = copy[locale];

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  excludeMatches: ["http://127.0.0.1/*", "http://localhost/*"],
  runAt: "document_idle",
  main() {
    if (isSensitivePage(location.href)) return;

    const picker = new WebPicker();
    picker.mount();
  }
});

class WebPicker {
  private host = document.createElement("sourcebook-picker-root");
  private shadow = this.host.attachShadow({ mode: "open" });
  private selectionToolbar = document.createElement("button");
  private hoverButton = document.createElement("button");
  private chatHoverButton = document.createElement("button");
  private cameraFrame = document.createElement("div");
  private multiPickBar = document.createElement("div");
  private taskStack = document.createElement("div");
  private overlayLayer = document.createElement("div");
  private lastHoverTarget: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null = null;
  private hoverPosition: PickerOverlayPosition = DEFAULT_PICKER_OVERLAY_POSITION;
  private lastChatTarget: ChatMessageCandidate | null = null;
  private lastPick: PickResponse | null = null;
  private lastAttemptPayload: PickPayload | null = null;
  private stagedPicks: StagedPick[] = [];
  private pickerEnabled = false;
  private mode: PickerMode = "idle";
  private hoverIntentTarget: HoverPickTarget | null = null;
  private chatMessageCache: ChatMessageCandidate[] = [];
  private chatCacheAt = 0;
  private multiSelectMode = false;
  private selectedChatMessages = new Map<string, ChatMessageCandidate>();
  private chatSelectionHoverId: string | null = null;
  private selectionTimer: number | undefined;
  private hoverIntentTimer: number | undefined;

  mount() {
    this.host.setAttribute("aria-hidden", "false");
    document.documentElement.append(this.host);
    this.shadow.append(
      this.styles(),
      this.overlayLayer,
      this.cameraFrame,
      this.selectionToolbar,
      this.hoverButton,
      this.chatHoverButton,
      this.multiPickBar,
      this.taskStack
    );

    this.overlayLayer.className = "overlay-layer";
    this.selectionToolbar.className = "pick-button selection";
    this.setPickButtonContent(this.selectionToolbar, text.pick);
    this.selectionToolbar.type = "button";
    this.selectionToolbar.hidden = true;

    this.hoverButton.className = "pick-button hover";
    this.setPickButtonContent(this.hoverButton, text.pick);
    this.hoverButton.type = "button";
    this.hoverButton.hidden = true;

    this.chatHoverButton.className = "pick-button chat-hover";
    this.setPickButtonContent(this.chatHoverButton, text.pickMessage);
    this.chatHoverButton.type = "button";
    this.chatHoverButton.hidden = true;

    this.cameraFrame.className = "camera-frame";
    this.cameraFrame.hidden = true;

    this.multiPickBar.className = "bottom-bar";
    this.multiPickBar.hidden = true;

    this.taskStack.className = "task-stack";

    document.addEventListener("selectionchange", () => this.scheduleSelectionToolbar());
    document.addEventListener("mouseup", () => this.scheduleSelectionToolbar());
    document.addEventListener("keyup", () => this.scheduleSelectionToolbar());
    document.addEventListener("mousemove", (event) => this.handlePointerMove(event), { passive: true });
    document.addEventListener("pointerdown", (event) => this.handlePointerDown(event), true);
    document.addEventListener("click", (event) => void this.handleDocumentClick(event), true);
    document.addEventListener("keydown", (event) => this.handleKeydown(event), true);
    const handleViewportChange = () => this.handleViewportChange();
    document.addEventListener(
      "scroll",
      handleViewportChange,
      { passive: true, capture: true }
    );
    window.addEventListener(
      "scroll",
      handleViewportChange,
      { passive: true, capture: true }
    );
    window.addEventListener("resize", () => {
      this.hideSelectionToolbar();
      this.clearHoverIntent();
      this.hideHoverButton();
      this.hideChatHoverButton();
      this.refreshStagedPickFrames();
      this.refreshMultiPickControls();
    });

    this.selectionToolbar.addEventListener("click", () => void this.pickSelection());
    this.hoverButton.addEventListener("click", () => void this.pickHoverTarget());
    this.chatHoverButton.addEventListener("click", () => void this.pickChatMessage());

    void this.loadPickerEnabled();
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[PICKER_LANGUAGE_KEY]) {
        locale = storedPickerLanguage(changes[PICKER_LANGUAGE_KEY].newValue);
        text = copy[locale];
      }
      if (changes[PICKER_OVERLAY_POSITION_KEY]) {
        this.hoverPosition = storedPickerOverlayPosition(changes[PICKER_OVERLAY_POSITION_KEY].newValue);
        this.repositionHoverButton();
      }
      if (changes[PICKER_ENABLED_KEY]) this.setPickerEnabled(changes[PICKER_ENABLED_KEY].newValue !== false);
    });

    browser.runtime.onMessage.addListener((message: PickerMessage): Promise<PickerMessageResponse> | undefined => {
      if (message.type === "PICK_ACTIVE") return this.pickActive();
      if (message.type === "PICK_PAGE") return this.pickPage();
      if (message.type === "DETECT_CHAT_PAGE") return Promise.resolve(this.detectChatPage());
      if (message.type === "PICK_VISIBLE_CHAT") return this.pickVisibleChat();
      if (message.type === "START_PICK_MODE") return Promise.resolve(this.startPickMode());
      if (message.type === "STOP_PICK_MODE") return Promise.resolve(this.stopPickMode());
      if (message.type === "CONFIRM_PICK_MODE") return this.confirmStagedPick();
      if (message.type === "GET_PICKER_STATUS") return Promise.resolve(this.getPickerStatus());
      if (message.type === "SET_PICKER_ENABLED") return Promise.resolve(this.setPickerEnabled(message.enabled));
      if (message.type === "START_CHAT_MULTI_PICK") return Promise.resolve(this.startChatMultiPick());
      if (message.type === "CANCEL_CHAT_MULTI_PICK") return Promise.resolve(this.cancelChatMultiPick());
      if (message.type === "CONFIRM_CHAT_MULTI_PICK") return this.pickSelectedChatMessages();
      return undefined;
    });
  }

  private async loadPickerEnabled() {
    const stored = await browser.storage.local.get([PICKER_ENABLED_KEY, PICKER_LANGUAGE_KEY, PICKER_OVERLAY_POSITION_KEY]);
    locale = storedPickerLanguage(stored[PICKER_LANGUAGE_KEY]);
    text = copy[locale];
    this.hoverPosition = storedPickerOverlayPosition(stored[PICKER_OVERLAY_POSITION_KEY]);
    this.setPickerEnabled(stored[PICKER_ENABLED_KEY] !== false);
  }

  private setPickerEnabled(enabled: boolean): PickerMessageResponse {
    this.pickerEnabled = enabled;
    if (!enabled) this.stopPickMode();
    return { status: "ok" };
  }

  private scheduleSelectionToolbar() {
    if (!this.pickerEnabled) {
      this.hideSelectionToolbar();
      return;
    }

    window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => this.positionSelectionToolbar(), 80);
  }

  private positionSelectionToolbar() {
    if (!this.pickerEnabled) {
      this.hideSelectionToolbar();
      return;
    }

    if (this.mode === "chat_select_mode") {
      this.hideSelectionToolbar();
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.hideSelectionToolbar();
      return;
    }

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    if (text.length < 2 || isEditableTarget(range.commonAncestorContainer)) {
      this.hideSelectionToolbar();
      return;
    }

    const rect = firstUsableRect(range.getClientRects());
    if (!rect) {
      this.hideSelectionToolbar();
      return;
    }

    this.selectionToolbar.hidden = false;
    this.selectionToolbar.style.top = `${Math.max(8, rect.top - 42)}px`;
    this.selectionToolbar.style.left = `${Math.min(window.innerWidth - 84, Math.max(8, rect.left))}px`;
  }

  private hideSelectionToolbar() {
    this.selectionToolbar.hidden = true;
  }

  private handlePointerMove(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    if (!this.pickerEnabled || !target || this.isPickerEvent(event)) return;

    if (this.mode === "chat_select_mode") {
      const chatTarget = this.chatTargetFromElement(target);
      if (chatTarget) {
        this.showChatSelectionAffordance(chatTarget.element, chatTarget.message);
        return;
      }

      this.clearChatHoverSelection();
      return;
    }

    if (this.mode === "pick_mode") {
      const pickTarget = this.pickTargetFromElement(target, event);
      if (pickTarget) {
        this.clearHoverIntent();
        this.hideHoverButton();
        this.hideChatHoverButton();
        this.showHoverFrame(pickTarget);
        return;
      }

      this.clearHoverFrame();
      return;
    }

    const image = target?.closest("img") || this.linkedImageFromElement(target);
    if (image && this.isPickableImage(image)) {
      this.scheduleHoverAffordance({ kind: "image", element: image });
      return;
    }

    const canvasImage = tldrawImageAtPoint(target, { x: event.clientX, y: event.clientY });
    if (canvasImage && this.isPickableImage(canvasImage)) {
      this.scheduleHoverAffordance({ kind: "image", element: canvasImage });
      return;
    }

    const video = target?.closest("video");
    if (video && this.isPickableVideo(video)) {
      this.scheduleHoverAffordance({ kind: "video", element: video });
      return;
    }

    const audio = target?.closest("audio");
    if (audio && this.isPickableAudio(audio)) {
      this.scheduleHoverAffordance({ kind: "audio", element: audio });
      return;
    }

    this.clearHoverIntent();
    if (!this.hoverButton.matches(":hover")) this.hideHoverButton();
    if (!this.chatHoverButton.matches(":hover")) this.hideChatHoverButton();
  }

  private async handleDocumentClick(event: MouseEvent) {
    if (this.isPickerEvent(event)) return;
    if (!this.pickerEnabled) return;
    if (this.mode !== "pick_mode" && this.mode !== "chat_select_mode") return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (this.mode === "chat_select_mode") {
      const chatTarget = this.chatTargetFromElement(target);
      if (!chatTarget) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.toggleChatSelection(chatTarget.message);
      return;
    }

    const pickTarget = this.pickTargetFromElement(target, event);
    if (pickTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.stagePickTarget(pickTarget);
    }
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.isPickerEvent(event)) return;
    if (!this.pickerEnabled || (this.mode !== "pick_mode" && this.mode !== "chat_select_mode")) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const shouldBlock =
      this.mode === "chat_select_mode"
        ? Boolean(this.chatTargetFromElement(target))
        : Boolean(this.pickTargetFromElement(target, event));
    if (!shouldBlock) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || this.mode === "idle") return;
    event.preventDefault();
    this.stopPickMode();
  }

  private scheduleHoverAffordance(target: HoverPickTarget) {
    if (this.isSameHoverTarget(target, this.hoverIntentTarget) || this.isCurrentHoverTarget(target)) return;

    this.clearHoverIntent();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.hoverIntentTarget = target;
    const delay = target.kind === "image" && target.element.closest("a[href]") ? 0 : 300;
    this.hoverIntentTimer = window.setTimeout(() => {
      if (!this.hoverIntentTarget) return;
      if (this.hoverIntentTarget.kind === "chat") {
        this.hideHoverButton();
        this.showChatHoverButton(this.hoverIntentTarget.message);
        return;
      }

      this.hideChatHoverButton();
      this.showHoverButton(this.hoverIntentTarget.element, this.hoverIntentTarget.kind);
    }, 300);
  }

  private clearHoverIntent() {
    window.clearTimeout(this.hoverIntentTimer);
    this.hoverIntentTimer = undefined;
    this.hoverIntentTarget = null;
  }

  private handleViewportChange() {
    this.clearHoverIntent();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.clearHoverFrame();
    this.chatCacheAt = 0;
    this.refreshStagedPickFrames();
    this.refreshMultiPickControls();
  }

  private isSameHoverTarget(a: HoverPickTarget, b: HoverPickTarget | null): boolean {
    return Boolean(b && a.kind === b.kind && a.element === b.element);
  }

  private isCurrentHoverTarget(target: HoverPickTarget): boolean {
    if (target.kind === "chat") return this.lastChatTarget?.id === target.message.id && !this.chatHoverButton.hidden;
    return this.lastHoverTarget === target.element && !this.hoverButton.hidden;
  }

  private isPickerEvent(event: Event): boolean {
    return event.composedPath().includes(this.host);
  }

  private pickTargetFromElement(target: Element, event?: Pick<MouseEvent, "clientX" | "clientY">): HoverPickTarget | null {
    const image = target.closest("img") || this.linkedImageFromElement(target);
    if (image && this.isPickableImage(image)) return { kind: "image", element: image };

    if (event) {
      const canvasImage = tldrawImageAtPoint(target, { x: event.clientX, y: event.clientY });
      if (canvasImage && this.isPickableImage(canvasImage)) return { kind: "image", element: canvasImage };
    }

    const video = target.closest("video");
    if (video && this.isPickableVideo(video)) return { kind: "video", element: video };

    const audio = target.closest("audio");
    if (audio && this.isPickableAudio(audio)) return { kind: "audio", element: audio };

    return null;
  }

  private linkedImageFromElement(target: Element): HTMLImageElement | null {
    const link = target.closest("a[href]");
    const image = link?.querySelector("img") ?? null;
    return image && this.isPickableImage(image) ? image : null;
  }

  private showHoverButton(target: HTMLImageElement | HTMLVideoElement | HTMLAudioElement, kind: "image" | "video" | "audio") {
    const rect = target.getBoundingClientRect();
    const inset = 8;
    this.lastHoverTarget = target;
    this.hoverButton.dataset.kind = kind;
    this.setPickButtonContent(this.hoverButton, kind === "image" ? text.pickImage : kind === "video" ? text.pickVideo : text.pickAudio);
    this.hoverButton.hidden = false;
    const buttonRect = this.hoverButton.getBoundingClientRect();
    const bottom = this.hoverPosition.startsWith("bottom");
    const left = this.hoverPosition.endsWith("left");
    const top = bottom ? rect.bottom - buttonRect.height - inset : rect.top + inset;
    const offsetLeft = left ? rect.left + inset : rect.right - buttonRect.width - inset;
    this.hoverButton.style.top = `${Math.max(inset, Math.min(window.innerHeight - buttonRect.height - inset, top))}px`;
    this.hoverButton.style.left = `${Math.max(inset, Math.min(window.innerWidth - buttonRect.width - inset, offsetLeft))}px`;
  }

  private repositionHoverButton() {
    const kind = this.hoverButton.dataset.kind;
    if (this.hoverButton.hidden || !this.lastHoverTarget || (kind !== "image" && kind !== "video" && kind !== "audio")) return;
    this.showHoverButton(this.lastHoverTarget, kind);
  }

  private hideHoverButton() {
    this.hoverButton.hidden = true;
    this.lastHoverTarget = null;
  }

  private showChatHoverButton(message: ChatMessageCandidate) {
    const element = this.resolveChatMessageElement(message);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    this.lastChatTarget = message;
    this.chatHoverButton.hidden = false;
    this.setPickButtonContent(this.chatHoverButton, `Pick ${message.role === "unknown" ? "message" : message.role}`);
    this.chatHoverButton.style.top = `${Math.max(8, rect.top + 8)}px`;
    this.chatHoverButton.style.left = `${Math.min(window.innerWidth - 128, Math.max(8, rect.right - 122))}px`;
  }

  private hideChatHoverButton() {
    this.chatHoverButton.hidden = true;
    this.lastChatTarget = null;
  }

  private showCameraFrame() {
    this.cameraFrame.hidden = false;
  }

  private hideCameraFrame() {
    this.cameraFrame.hidden = true;
  }

  private showHoverFrame(target: HoverPickTarget) {
    this.clearHoverFrame();
    const rect = target.element.getBoundingClientRect();
    const frame = document.createElement("div");
    frame.className = "pick-hover-frame";
    frame.style.top = `${rect.top}px`;
    frame.style.left = `${rect.left}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
    this.overlayLayer.append(frame);
  }

  private clearHoverFrame() {
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".pick-hover-frame"))) frame.remove();
  }

  private stagePickTarget(target: HoverPickTarget) {
    const staged = this.stagedPickFromTarget(target);
    if (!staged) {
      this.showToast({ status: "error", message: text.unsupportedContent });
      return;
    }

    const existingIndex = this.stagedPicks.findIndex((item) => item.key === staged.key);
    if (existingIndex >= 0) {
      this.stagedPicks.splice(existingIndex, 1);
      this.clearHoverFrame();
      this.renderStagedPickFrames();
      this.renderPickModeBar();
      return;
    }

    this.stagedPicks.push(staged);
    this.clearHoverFrame();
    this.renderStagedPickFrames();
    this.renderPickModeBar();
  }

  private stagedPickFromTarget(target: HoverPickTarget): StagedPick | null {
    if (target.kind === "image") {
      return {
        key: `image:${cssPath(target.element) || target.element.currentSrc || target.element.src}`,
        target,
        payload: this.imagePayload(target.element),
        rects: [target.element.getBoundingClientRect()],
        label: "Image"
      };
    }

    if (target.kind === "video") {
      return {
        key: `video:${cssPath(target.element) || videoSource(target.element)}`,
        target,
        payload: this.videoPayload(target.element),
        rects: [target.element.getBoundingClientRect()],
        label: "Video"
      };
    }

    if (target.kind === "audio") {
      return {
        key: `audio:${cssPath(target.element) || mediaSource(target.element)}`,
        target,
        payload: this.audioPayload(target.element),
        rects: [target.element.getBoundingClientRect()],
        label: "Audio"
      };
    }

    const payload = this.chatMessagesPayload([target.message], "chat_message");
    if (!payload) return null;
    return {
      key: `chat:${target.message.id}`,
      target,
      payload,
      rects: [target.element.getBoundingClientRect()],
      label: target.message.role === "unknown" ? "Message" : `${target.message.role} message`
    };
  }

  private renderStagedPickFrames() {
    this.clearStagedPickFrame();
    for (const staged of this.stagedPicks) {
      for (const rect of staged.rects) {
        const frame = document.createElement("div");
        frame.className = "pick-staged-frame";
        frame.style.top = `${rect.top}px`;
        frame.style.left = `${rect.left}px`;
        frame.style.width = `${rect.width}px`;
        frame.style.height = `${rect.height}px`;
        this.overlayLayer.append(frame);
      }
    }
  }

  private refreshStagedPickFrames() {
    if (!this.stagedPicks.length) return;
    for (const staged of this.stagedPicks) {
      staged.rects = [staged.target.element.getBoundingClientRect()];
    }
    this.renderStagedPickFrames();
  }

  private clearStagedPick() {
    this.stagedPicks = [];
    this.clearStagedPickFrame();
  }

  private clearStagedPickFrame() {
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".pick-staged-frame"))) frame.remove();
  }

  private isPickableImage(image: HTMLImageElement): boolean {
    const rect = image.getBoundingClientRect();
    return Boolean(image.currentSrc || image.src) && rect.width >= 120 && rect.height >= 120 && rect.bottom > 0 && rect.right > 0;
  }

  private isPickableVideo(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    return Boolean(videoSource(video) || video.poster) && rect.width >= 120 && rect.height >= 120 && rect.bottom > 0 && rect.right > 0;
  }

  private isPickableAudio(audio: HTMLAudioElement): boolean {
    const rect = audio.getBoundingClientRect();
    return Boolean(mediaSource(audio)) && rect.width >= 120 && rect.height >= 28 && rect.bottom > 0 && rect.right > 0;
  }

  private async pickActive(): Promise<PickerMessageResponse> {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return this.pickSelection();
    }

    return this.pickPage();
  }

  private async pickSelection(): Promise<PickerMessageResponse> {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { status: "error", message: text.noSelection };
    }

    const range = selection.getRangeAt(0);
    const contentText = selection.toString().trim();
    if (!contentText || isEditableTarget(range.commonAncestorContainer)) {
      return { status: "error", message: text.invalidSelection };
    }

    const payload = this.basePayload("text", "selection", {
      contentText,
      locator: {
        cssSelector: cssPath(parentElementOf(range.commonAncestorContainer)),
        textQuote: quoteWithContext(contentText),
        textPosition: textPositionInBody(contentText)
      }
    });

    const response = await this.savePick(payload);
    this.flashRects(Array.from(range.getClientRects()));
    this.hideSelectionToolbar();
    return response;
  }

  private async pickHoverTarget(): Promise<PickerMessageResponse> {
    const target = this.lastHoverTarget;
    if (!target) return { status: "error", message: text.noContent };

    const response =
      target instanceof HTMLImageElement
        ? await this.pickImage(target)
        : target instanceof HTMLVideoElement
          ? await this.pickVideo(target)
          : await this.pickAudio(target);
    this.hideHoverButton();
    return response;
  }

  private async pickImage(image: HTMLImageElement): Promise<PickerMessageResponse> {
    const rect = image.getBoundingClientRect();
    const response = await this.savePick(this.imagePayload(image));
    this.flashRects([rect]);
    return response;
  }

  private imagePayload(image: HTMLImageElement): PickPayload {
    const src = image.currentSrc || image.src;
    return this.basePayload("image", "image", {
      contentText: image.alt?.trim() || undefined,
      contentUrl: absoluteUrl(src),
      thumbnailUrl: absoluteUrl(src),
      locator: {
        imageSelector: cssPath(image)
      },
      pageMetadata: {
        ...collectPageMetadata(),
        description: image.alt?.trim() || collectPageMetadata().description
      }
    });
  }

  private async pickVideo(video: HTMLVideoElement): Promise<PickerMessageResponse> {
    const rect = video.getBoundingClientRect();
    const response = await this.savePick(this.videoPayload(video));
    this.flashRects([rect]);
    return response;
  }

  private videoPayload(video: HTMLVideoElement): PickPayload {
    const pageMetadata = collectPageMetadata();
    const candidateUrl = absoluteUrl(videoSource(video));
    // Page players commonly expose a blob URL, which cannot be opened outside this tab.
    // Preserve the page URL in that case and rely on its page cover for the video preview.
    const contentUrl = candidateUrl && !candidateUrl.startsWith("blob:") ? candidateUrl : location.href;
    const thumbnailUrl = (video.poster ? absoluteUrl(video.poster) : undefined) ?? pageMetadata.ogImage;
    return this.basePayload("video", "video", {
      contentText: video.getAttribute("aria-label") || video.title || video.poster || undefined,
      contentUrl,
      thumbnailUrl,
      locator: {
        videoSelector: cssPath(video)
      },
      pageMetadata: {
        ...pageMetadata,
        mediaDurationSeconds: mediaDuration(video),
        description: video.getAttribute("aria-label") || video.title || pageMetadata.description
      }
    });
  }

  private async pickAudio(audio: HTMLAudioElement): Promise<PickerMessageResponse> {
    const rect = audio.getBoundingClientRect();
    const response = await this.savePick(this.audioPayload(audio));
    this.flashRects([rect]);
    return response;
  }

  private audioPayload(audio: HTMLAudioElement): PickPayload {
    const src = mediaSource(audio) || location.href;
    const pageMetadata = collectPageMetadata(document, { includePreviewImage: false });
    return this.basePayload("audio", "audio", {
      contentText: audio.getAttribute("aria-label") || audio.title || undefined,
      contentUrl: absoluteUrl(src),
      locator: { audioSelector: cssPath(audio) },
      pageMetadata: {
        ...pageMetadata,
        mediaDurationSeconds: mediaDuration(audio),
        description: audio.getAttribute("aria-label") || audio.title || pageMetadata.description
      }
    });
  }

  private async pickPage(): Promise<PickerMessageResponse> {
    const metadata = collectPageMetadata(document, { includePreviewImage: false });
    const payload = this.basePayload("link", "whole_page", {
      contentUrl: location.href,
      thumbnailUrl: metadata.ogImage,
      pageMetadata: metadata
    });

    return this.savePick(payload);
  }

  private detectChatPage(): PickerMessageResponse {
    const extracted = extractVisibleChat(document);
    if (!extracted) return { status: "unsupported" };

    return {
      status: "supported",
      provider: extracted.provider,
      messageCount: extracted.messages.length
    };
  }

  private startPickMode(): PickerMessageResponse {
    if (!this.pickerEnabled) return { status: "error", message: text.enablePicker };
    this.mode = "pick_mode";
    this.multiSelectMode = false;
    this.selectedChatMessages.clear();
    this.chatSelectionHoverId = null;
    this.clearMultiPickControls();
    this.clearStagedPick();
    this.clearHoverFrame();
    this.hideSelectionToolbar();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.showCameraFrame();
    this.renderPickModeBar();
    return { status: "ok" };
  }

  private stopPickMode(): PickerMessageResponse {
    this.mode = "idle";
    this.multiSelectMode = false;
    this.selectedChatMessages.clear();
    this.chatSelectionHoverId = null;
    this.clearHoverIntent();
    this.clearMultiPickControls();
    this.clearHoverFrame();
    this.clearStagedPick();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.hideSelectionToolbar();
    this.hideCameraFrame();
    return { status: "ok" };
  }

  private getPickerStatus(): PickerMessageResponse {
    const extracted = extractVisibleChat(document);
    return {
      status: "picker_status",
      mode: this.mode,
      enabled: this.pickerEnabled,
      pageAvailable: true,
      chatProvider: extracted?.provider,
      messageCount: extracted?.messages.length || 0,
      browserStoredCount: 0,
      localServiceConnected: false,
      recentPicks: []
    };
  }

  private async pickChatMessage(): Promise<PickerMessageResponse> {
    const message = this.lastChatTarget;
    if (!message) return { status: "error", message: text.noMessage };

    const response = await this.saveChatMessage(message);
    this.hideChatHoverButton();
    return response;
  }

  private async saveChatMessage(message: ChatMessageCandidate): Promise<PickerMessageResponse> {
    const response = await this.saveChatMessages([message], "chat_message");
    this.flashChatMessages([message]);
    return response;
  }

  private renderPickModeBar() {
    this.multiPickBar.innerHTML = "";
    this.multiPickBar.dataset.mode = "media";

    const stagedCount = this.stagedPicks.length;
    const title = document.createElement("span");
    title.className = "mode-title";
    title.dataset.role = "selection-count";
    title.textContent = text.selectedCount(stagedCount);

    const hint = document.createElement("span");
    hint.className = "mode-detail";
    hint.textContent = text.pickMediaMode;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.dataset.variant = "primary";
    confirm.disabled = stagedCount === 0;
    confirm.textContent = stagedCount === 1 ? text.confirmPick : text.confirmCount(stagedCount);
    confirm.addEventListener("click", () => void this.confirmStagedPick());

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.variant = "cancel";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.cancelPickMode());

    const actions = document.createElement("div");
    actions.className = "bottom-bar-actions";
    actions.append(cancel, confirm);

    this.multiPickBar.append(title, hint, actions);
    this.multiPickBar.hidden = false;
  }

  private cancelPickMode() {
    this.stopPickMode();
    this.openPickerPopup();
  }

  private async confirmStagedPick(): Promise<PickerMessageResponse> {
    if (!this.stagedPicks.length) {
      this.stopPickMode();
      return { status: "ok" };
    }

    const stagedItems = this.stagedPicks.slice();
    // Start every visible task immediately so multi-picks are stacked in the order
    // they were selected instead of appearing one at a time after each download.
    const results = await Promise.all(stagedItems.map((staged) => this.savePick(staged.payload)));
    const response = results.at(-1) ?? { status: "ok" };

    this.flashRects(stagedItems.flatMap((staged) => staged.rects));
    this.clearStagedPick();
    this.stopPickMode();
    return response;
  }

  private async pickVisibleChat(): Promise<PickerMessageResponse> {
    const extracted = extractVisibleChat(document);
    if (!extracted) return { status: "error", message: text.chatUnsupported };
    if (!extracted.messages.length) return { status: "error", message: text.noLoadedMessages };

    const response = await this.saveChatMessages(extracted.messages, "visible_conversation", extracted.provider);
    this.flashChatMessages(extracted.messages);
    return response;
  }

  private startChatMultiPick(): PickerMessageResponse {
    if (!this.pickerEnabled) return { status: "error", message: text.enablePicker };
    const provider = detectChatProvider(location.href);
    if (!provider) return { status: "unsupported" };

    this.mode = "chat_select_mode";
    this.multiSelectMode = true;
    this.selectedChatMessages.clear();
    this.chatSelectionHoverId = null;
    this.clearHoverIntent();
    this.clearHoverFrame();
    this.clearStagedPick();
    this.hideSelectionToolbar();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.chatMessageCache = [];
    this.chatCacheAt = 0;
    this.renderMultiPickControls(provider, []);
    return {
      status: "supported",
      provider,
      messageCount: 0
    };
  }

  private cancelChatMultiPick(): PickerMessageResponse {
    if (this.mode === "chat_select_mode") this.mode = "idle";
    this.multiSelectMode = false;
    this.selectedChatMessages.clear();
    this.chatSelectionHoverId = null;
    this.clearMultiPickControls();
    return { status: "ok" };
  }

  private async saveChatMessages(
    messages: ChatMessageCandidate[],
    pickType: "chat_message" | "selected_messages" | "visible_conversation",
    providerOverride?: ChatProvider
  ): Promise<PickerMessageResponse> {
    if (!messages.length || messages.some((message) => message.role === "unknown" || !message.text.trim())) {
      return { status: "error", message: text.invalidChatMessages };
    }

    const payload = this.chatMessagesPayload(messages, pickType, providerOverride);
    if (!payload) return { status: "error", message: text.noChatSource };

    return this.savePick(payload);
  }

  private chatMessagesPayload(
    messages: ChatMessageCandidate[],
    pickType: "chat_message" | "selected_messages" | "visible_conversation",
    providerOverride?: ChatProvider
  ): PickPayload | null {
    const provider = providerOverride || messages[0]?.provider;
    if (!provider) return null;

    const orderedMessages = messages.slice().sort((a, b) => a.order - b.order);
    const conversation = buildConversationPick(provider, orderedMessages);
    const transcript = transcriptFromMessages(provider, orderedMessages);
    const selectors = orderedMessages.map((message) => message.messageSelector).filter(Boolean) as string[];
    const label = providerLabel(provider);
    const contentLabel =
      pickType === "chat_message"
        ? `${label} message · ${orderedMessages[0]?.role || "unknown"}`
        : `${label} visible chat · ${orderedMessages.length} messages`;

    return this.basePayload("conversation", pickType, {
      contentText: transcript,
      contentUrl: location.href,
      locator: {
        chatProvider: provider,
        messageSelector: selectors[0],
        messageSelectors: selectors,
        startMessageSelector: selectors[0],
        endMessageSelector: selectors[selectors.length - 1]
      },
      pageMetadata: {
        ...collectPageMetadata(),
        description: contentLabel
      },
      conversation
    });
  }

  private renderMultiPickControls(provider: ChatProvider, messages: ChatMessageCandidate[]) {
    this.clearMultiPickControls();
    this.chatMessageCache = messages;
    this.chatCacheAt = Date.now();

    const title = document.createElement("span");
    title.className = "mode-title";
    title.dataset.role = "selection-count";
    title.textContent = text.pickChatMode;

    const context = document.createElement("span");
    context.className = "mode-detail";
    context.dataset.role = "context";
    context.textContent = text.selectMessagesTitle(providerLabel(provider));

    const pickSelected = document.createElement("button");
    pickSelected.type = "button";
    pickSelected.dataset.variant = "primary";
    pickSelected.dataset.role = "confirm";
    pickSelected.disabled = true;
    pickSelected.textContent = text.pickSelected;
    pickSelected.addEventListener("click", () => void this.pickSelectedChatMessages());

    const pickVisible = document.createElement("button");
    pickVisible.type = "button";
    pickVisible.dataset.variant = "cancel";
    pickVisible.dataset.role = "select-all";
    pickVisible.textContent = text.pickVisible;
    pickVisible.addEventListener("click", () => this.selectAllLoadedChatMessages());

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.variant = "cancel";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.cancelChatMultiPickAndOpenPopup());

    this.multiPickBar.innerHTML = "";
    this.multiPickBar.dataset.mode = "chat";
    const actions = document.createElement("div");
    actions.className = "bottom-bar-actions";
    actions.append(pickVisible, cancel, pickSelected);

    this.multiPickBar.append(title, context, actions);
    this.multiPickBar.hidden = false;
    this.renderSelectedChatFrames();
  }

  private clearMultiPickControls() {
    this.chatSelectionHoverId = null;
    for (const marker of Array.from(this.overlayLayer.querySelectorAll(".chat-select-marker"))) marker.remove();
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".chat-selection-frame"))) frame.remove();
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".chat-hover-selection-frame"))) frame.remove();
    this.multiPickBar.hidden = true;
    this.multiPickBar.innerHTML = "";
  }

  private refreshMultiPickControls() {
    if (!this.multiSelectMode) return;
    this.clearChatHoverSelection();
    this.renderSelectedChatFrames();
  }

  private toggleChatSelection(message: ChatMessageCandidate) {
    const key = chatSelectionKey(message);
    let isSelected: boolean;
    if (this.selectedChatMessages.has(key)) {
      this.selectedChatMessages.delete(key);
      isSelected = false;
    } else {
      this.selectedChatMessages.set(key, message);
      isSelected = true;
    }

    this.updateChatSelectionCount();
    this.renderSelectedChatFrames();
    if (!isSelected) {
      this.clearChatHoverSelection();
      return;
    }

    for (const marker of Array.from(this.overlayLayer.querySelectorAll<HTMLButtonElement>(".chat-select-marker"))) {
      marker.classList.toggle("selected", marker.dataset.messageKey === key);
    }
  }

  private updateChatSelectionCount() {
    const context = this.multiPickBar.querySelector<HTMLElement>('[data-role="context"]');
    if (!context) return;

    const selectedCount = this.selectedChatMessages.size;
    const count = this.multiPickBar.querySelector<HTMLElement>('[data-role="selection-count"]');
    if (count) count.textContent = selectedCount ? text.selectedMessagesCount(selectedCount) : text.pickChatMode;
    context.textContent = selectedCount
      ? text.pickChatMode
      : text.selectMessagesTitle(providerLabel(this.chatMessageCache[0]?.provider || "chatgpt"));

    const confirm = this.multiPickBar.querySelector<HTMLButtonElement>('[data-role="confirm"]');
    if (confirm) confirm.disabled = selectedCount === 0;
  }

  private async pickSelectedChatMessages(): Promise<PickerMessageResponse> {
    const selected = Array.from(this.selectedChatMessages.values()).sort((a, b) => a.order - b.order);
    if (!selected.length) return { status: "ok" };

    const response = await this.saveChatMessages(selected, "selected_messages");
    this.flashChatMessages(selected);
    this.cancelChatMultiPick();
    return response;
  }

  private cancelChatMultiPickAndOpenPopup() {
    this.cancelChatMultiPick();
    this.openPickerPopup();
  }

  private selectAllLoadedChatMessages(): PickerMessageResponse {
    const extracted = extractVisibleChat(document);
    if (!extracted) return { status: "error", message: text.chatUnsupported };
    if (!extracted.messages.length) return { status: "error", message: text.noLoadedMessages };

    this.chatMessageCache = extracted.messages;
    this.chatCacheAt = Date.now();
    this.selectedChatMessages.clear();
    for (const message of extracted.messages) {
      if (message.role !== "unknown" && message.text.trim()) this.selectedChatMessages.set(chatSelectionKey(message), message);
    }

    this.clearChatHoverSelection();
    this.updateChatSelectionCount();
    this.renderSelectedChatFrames();
    return { status: "supported", provider: extracted.provider, messageCount: this.selectedChatMessages.size };
  }

  private openPickerPopup() {
    void browser.runtime.sendMessage({ type: "OPEN_PICKER_POPUP" } satisfies PickerMessage);
  }

  private chatTargetFromElement(target: Element): { element: HTMLElement; message: ChatMessageCandidate } | null {
    const provider = detectChatProvider(location.href);
    if (provider) {
      const message = extractChatMessageFromElement(provider, target, document);
      const element = message ? this.resolveChatMessageElement(message) : null;
      if (message && element) return { element, message };
    }

    const extracted = this.getCachedChatMessages();
    if (!extracted.length) return null;

    for (const message of extracted) {
      const element = this.resolveChatMessageElement(message);
      if (element && element.contains(target)) return { element, message };
    }

    return null;
  }

  private getCachedChatMessages(): ChatMessageCandidate[] {
    if (Date.now() - this.chatCacheAt < 1200) return this.chatMessageCache;

    const extracted = extractVisibleChat(document);
    this.chatMessageCache = extracted?.messages || [];
    this.chatCacheAt = Date.now();
    return this.chatMessageCache;
  }

  private resolveChatMessageElement(message: ChatMessageCandidate): HTMLElement | null {
    return chatMessageElement(message) || (message.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector) : null);
  }

  private showChatSelectionAffordance(element: HTMLElement, message: ChatMessageCandidate) {
    const key = chatSelectionKey(message);
    if (this.chatSelectionHoverId === key && this.overlayLayer.querySelector(".chat-select-marker")) {
      const marker = this.overlayLayer.querySelector<HTMLButtonElement>(".chat-select-marker");
      marker?.classList.toggle("selected", this.selectedChatMessages.has(key));
      return;
    }

    this.clearChatHoverSelection();
    this.chatSelectionHoverId = key;

    const rect = element.getBoundingClientRect();
    const frame = document.createElement("div");
    frame.className = "chat-hover-selection-frame";
    frame.style.top = `${rect.top}px`;
    frame.style.left = `${rect.left}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
    this.overlayLayer.append(frame);

    const marker = document.createElement("button");
    marker.className = "chat-select-marker";
    marker.type = "button";
    marker.dataset.messageKey = key;
    marker.ariaLabel = text.selectMessage;
    marker.classList.toggle("selected", this.selectedChatMessages.has(key));
    marker.style.top = `${Math.max(8, rect.top + 10)}px`;
    marker.style.left = `${Math.max(8, rect.left - 34)}px`;
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.toggleChatSelection(message);
    });
    this.overlayLayer.append(marker);
  }

  private clearChatHoverSelection() {
    this.chatSelectionHoverId = null;
    for (const marker of Array.from(this.overlayLayer.querySelectorAll(".chat-select-marker"))) marker.remove();
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".chat-hover-selection-frame"))) frame.remove();
  }

  private renderSelectedChatFrames() {
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(".chat-selection-frame"))) frame.remove();

    for (const message of this.selectedChatMessages.values()) {
      const element = this.resolveChatMessageElement(message);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;

      const frame = document.createElement("div");
      frame.className = "chat-selection-frame selected";
      frame.dataset.messageId = message.id;
      frame.style.top = `${rect.top}px`;
      frame.style.left = `${rect.left}px`;
      frame.style.width = `${rect.width}px`;
      frame.style.height = `${rect.height}px`;
      this.overlayLayer.append(frame);
    }
  }

  private flashChatMessages(messages: ChatMessageCandidate[]) {
    const rects = messages
      .map((message) => this.resolveChatMessageElement(message)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect));
    this.flashRects(rects);
  }

  private basePayload(
    modality: PickPayload["modality"],
    pickType: PickPayload["pickType"],
    overrides: Partial<PickPayload>
  ): PickPayload {
    return {
      sourceType: "webpage",
      modality,
      pickType,
      sourceUrl: location.href,
      sourceTitle: getPageTitle(),
      sourceOrigin: getSourceOrigin(location.href),
      faviconUrl: getFaviconUrl(),
      pickedAt: new Date().toISOString(),
      ...overrides
    };
  }

  private async savePick(payload: PickPayload, showFeedback = true): Promise<PickerMessageResponse> {
    this.lastAttemptPayload = payload;
    const task = showFeedback ? this.createPickTask(payload) : undefined;
    let response: PickerMessageResponse;
    try {
      response = (await browser.runtime.sendMessage({
        type: "SAVE_PICK",
        payload
      } satisfies PickerMessage)) as PickerMessageResponse;
    } catch (error) {
      response = {
        status: "error",
        message: error instanceof Error ? error.message : text.unsupportedContent
      };
    }

    if ("sourceItemId" in response && response.status !== "moved") this.lastPick = response;
    if (task) void this.completePickTask(task, response);
    return response;
  }

  private createPickTask(payload: PickPayload): PickTask {
    const element = document.createElement("section");
    element.className = "pick-task is-loading";
    const spinner = document.createElement("span");
    spinner.className = "pick-task-spinner";
    spinner.setAttribute("aria-label", text.saving);
    const label = document.createElement("strong");
    label.textContent = payload.modality === "image" ? text.downloading : text.saving;
    element.append(spinner, label);
    this.taskStack.append(element);
    return { element, payload };
  }

  private setPickButtonContent(button: HTMLButtonElement, label: string) {
    const mark = this.createPickButtonMark();
    const textLabel = document.createElement("span");
    textLabel.textContent = label;
    button.replaceChildren(mark, textLabel);
  }

  private createPickButtonMark() {
    const ns = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(ns, "svg");
    icon.classList.add("pick-button-mark");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.setAttribute("viewBox", "0 0 256 256");

    const create = (name: string, attributes: Record<string, string>) => {
      const node = document.createElementNS(ns, name);
      for (const [attribute, value] of Object.entries(attributes)) node.setAttribute(attribute, value);
      return node;
    };
    const body = create("g", { fill: "currentColor" });
    for (const [x, y, width, height, rx] of [
      ["36", "60", "42", "28", "5"],
      ["36", "105", "42", "28", "5"],
      ["36", "150", "42", "28", "5"],
      ["66", "36", "166", "166", "15"],
      ["94", "190", "36", "34", "6"],
      ["168", "190", "36", "34", "6"],
    ]) body.append(create("rect", { x, y, width, height, rx }));
    icon.append(
      body,
      create("path", {
        d: "m133 100 19 20-19 20",
        fill: "none",
        stroke: "#111827",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": "18",
      }),
      create("rect", { x: "179", y: "91", width: "18", height: "58", rx: "9", fill: "#111827" }),
    );
    return icon;
  }

  private async completePickTask(task: PickTask, response: PickerMessageResponse) {
    if (response.status === "error") {
      this.renderFailedTask(task, response.message);
      return;
    }
    if (!("sourceItemId" in response) || response.status === "moved") {
      this.renderFailedTask(task, text.unsupportedContent);
      return;
    }
    if (response.cacheState === "failed") {
      this.renderFailedTask(task, response.downloadError || text.imageDownloadFailed);
      return;
    }

    task.sourceItemId = response.sourceItemId;
    task.sourceBookId = response.bookId;
    const { books, activeBookId } = await this.readBooks();
    const currentBookId = response.bookId || activeBookId;
    const currentBookName = books.find((book) => book.id === currentBookId)?.name || "Sourcebook";
    this.renderSavedTask(task, currentBookId, currentBookName, books);
    this.removeTaskLater(task);
  }

  private renderSavedTask(task: PickTask, currentBookId: string | undefined, currentBookName: string, books: Array<{ id: string; name: string }>) {
    task.element.className = "pick-task is-saved";
    const details = document.createElement("div");
    details.className = "pick-task-details";
    const status = this.taskSubtitle(text.saved);
    const bookToggle = document.createElement("button");
    bookToggle.type = "button";
    bookToggle.className = "pick-task-book";
    const bookName = document.createElement("span");
    bookName.textContent = currentBookName;
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = '<path d="m7 10 5 5 5-5" />';
    bookToggle.append(bookName, chevron);
    details.append(status, bookToggle);

    const chooser = this.createBookChooser(task, currentBookId, books, bookName, bookToggle);
    bookToggle.addEventListener("click", () => {
      const open = chooser.hidden;
      chooser.hidden = !open;
      task.element.classList.toggle("is-book-open", open);
      bookToggle.setAttribute("aria-expanded", String(open));
      if (open) window.clearTimeout(task.dismissTimer);
      else this.removeTaskLater(task);
    });

    const view = document.createElement("button");
    view.type = "button";
    view.className = "pick-task-view";
    view.textContent = text.view;
    view.addEventListener("click", () => void browser.runtime.sendMessage({ type: "OPEN_SOURCES", bookId: task.sourceBookId || currentBookId } satisfies PickerMessage));
    task.element.replaceChildren(this.taskPreview(task.payload), details, view, chooser);
  }

  private renderFailedTask(task: PickTask, message: string) {
    task.element.className = "pick-task is-failed";
    const details = document.createElement("div");
    details.className = "pick-task-details";
    details.append(this.taskSubtitle(message));
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "pick-task-view";
    retry.textContent = text.retry;
    retry.addEventListener("click", () => {
      task.element.remove();
      void this.savePick(task.payload);
    });
    task.element.replaceChildren(this.taskPreview(task.payload), details, retry);
    this.removeTaskLater(task);
  }

  private createBookChooser(
    task: PickTask,
    currentBookId: string | undefined,
    books: Array<{ id: string; name: string }>,
    bookName: HTMLElement,
    bookToggle: HTMLButtonElement
  ): HTMLElement {
    const chooser = document.createElement("section");
    chooser.className = "pick-task-book-panel";
    chooser.hidden = true;
    const head = document.createElement("div");
    head.className = "pick-task-book-head";
    const label = document.createElement("strong");
    label.textContent = text.books;
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "pick-task-new-book";
    newButton.textContent = `+ ${text.newBook}`;
    head.append(label, newButton);

    const options = document.createElement("div");
    options.className = "pick-task-book-options";
    const form = document.createElement("form");
    form.className = "pick-task-new-book-form";
    form.hidden = true;
    const input = document.createElement("input");
    input.placeholder = text.newBookPlaceholder;
    const create = document.createElement("button");
    create.type = "submit";
    create.textContent = text.newBook;
    form.append(input, create);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "pick-task-confirm-book";
    confirm.textContent = text.confirmBook;
    chooser.append(head, options, form, confirm);

    let selectedBookId = currentBookId;
    let availableBooks = books.slice();
    const renderOptions = () => options.replaceChildren(...availableBooks.map((book) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "pick-task-book-option";
      option.setAttribute("aria-pressed", String(book.id === selectedBookId));
      const optionName = document.createElement("span");
      optionName.textContent = book.name;
      const radio = document.createElement("span");
      radio.className = "pick-task-book-radio";
      option.append(optionName, radio);
      option.addEventListener("click", () => { selectedBookId = book.id; renderOptions(); });
      return option;
    }));
    renderOptions();

    newButton.addEventListener("click", () => { form.hidden = false; input.focus(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      create.disabled = true;
      const created = await browser.runtime.sendMessage({ type: "CREATE_BOOK", name: input.value.trim() } satisfies PickerMessage) as PickerMessageResponse;
      create.disabled = false;
      if (created.status === "book_created") {
        availableBooks = [...availableBooks, created.book];
        selectedBookId = created.book.id;
        input.value = "";
        form.hidden = true;
        renderOptions();
      } else if (created.status === "error") this.renderFailedTask(task, created.message || text.moveFailed);
    });
    confirm.addEventListener("click", async () => {
      if (!task.sourceItemId || !task.sourceBookId || !selectedBookId) return;
      if (selectedBookId === task.sourceBookId) { chooser.hidden = true; task.element.classList.remove("is-book-open"); this.removeTaskLater(task); return; }
      confirm.disabled = true;
      const moved = await browser.runtime.sendMessage({ type: "MOVE_PICK_TO_BOOK", sourceItemId: task.sourceItemId, sourceBookId: task.sourceBookId, targetBookId: selectedBookId } satisfies PickerMessage) as PickerMessageResponse;
      if (moved.status === "moved") {
        task.sourceItemId = moved.sourceItemId;
        task.sourceBookId = moved.bookId;
        bookName.textContent = availableBooks.find((book) => book.id === moved.bookId)?.name || bookName.textContent;
        chooser.hidden = true;
        task.element.classList.remove("is-book-open");
        bookToggle.setAttribute("aria-expanded", "false");
        this.removeTaskLater(task);
      } else if (moved.status === "error") this.renderFailedTask(task, moved.message || text.moveFailed);
      confirm.disabled = false;
    });
    return chooser;
  }

  private taskPreview(payload: PickPayload): HTMLElement {
    if ((payload.modality === "image" || payload.modality === "video") && (payload.thumbnailUrl || payload.contentUrl)) {
      const image = document.createElement("img");
      image.className = "pick-task-preview";
      image.src = payload.thumbnailUrl || payload.contentUrl || "";
      image.alt = "";
      return image;
    }
    const fallback = document.createElement("span");
    fallback.className = "pick-task-fallback";
    fallback.textContent = "P";
    return fallback;
  }

  private taskTitle(payload: PickPayload): HTMLElement {
    const title = document.createElement("strong");
    const value = payload.pageMetadata?.pageTitle || payload.contentText || payload.sourceTitle || "Pick";
    title.textContent = truncatePickTitle(value);
    return title;
  }

  private taskSubtitle(value: string): HTMLElement {
    const subtitle = document.createElement("span");
    subtitle.textContent = value;
    return subtitle;
  }

  private async readBooks() {
    const response = (await browser.runtime.sendMessage({ type: "GET_PICKER_STATUS" } satisfies PickerMessage)) as PickerMessageResponse;
    return response.status === "picker_status"
      ? { books: response.books || [], activeBookId: response.activeBookId }
      : { books: [], activeBookId: undefined };
  }

  private removeTaskLater(task: PickTask) {
    const scheduleDismissal = () => {
      if (task.element.classList.contains("is-book-open")) return;
      window.clearTimeout(task.dismissTimer);
      task.dismissTimer = window.setTimeout(() => task.element.remove(), 3_000);
    };

    if (!task.dismissalBound) {
      task.dismissalBound = true;
      task.element.addEventListener("pointerenter", () => window.clearTimeout(task.dismissTimer));
      task.element.addEventListener("pointerleave", scheduleDismissal);
    }

    scheduleDismissal();
  }

  private createToast(): ToastTask {
    const element = document.createElement("section");
    element.className = "toast";
    this.taskStack.append(element);
    return { element };
  }

  private showToast(response: PickerMessageResponse) {
    const toast = this.createToast();
    const message =
      response.status === "duplicate"
          ? text.duplicateOne
        : response.status === "error"
          ? response.message
          : text.savedOne;

    toast.element.innerHTML = "";

    const label = document.createElement("span");
    label.textContent = message;
    toast.element.append(label);

    if (response.status === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = text.retry;
      retry.disabled = !this.lastAttemptPayload;
      retry.addEventListener("click", () => {
        toast.element.remove();
        if (this.lastAttemptPayload) void this.savePick(this.lastAttemptPayload);
      });
      toast.element.append(retry);
    } else {
      const note = document.createElement("button");
      note.type = "button";
      note.textContent = text.addNote;
      note.addEventListener("click", () => this.renderNoteEditor(toast));

      const open = document.createElement("button");
      open.type = "button";
      open.textContent = text.openSources;
      open.addEventListener("click", () => void browser.runtime.sendMessage({ type: "OPEN_SOURCES", bookId: this.lastPick?.bookId } satisfies PickerMessage));

      toast.element.append(note, open);
    }

    this.scheduleToastDismiss(toast);
  }

  private renderNoteEditor(toast: ToastTask) {
    if (!this.lastPick) return;
    window.clearTimeout(toast.dismissTimer);

    toast.element.innerHTML = "";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = text.addNotePlaceholder;
    input.maxLength = 240;
    input.ariaLabel = text.addNoteAria;

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = text.save;
    save.addEventListener("click", () => void this.saveNote(input.value, toast));

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.showStatusToast(text.noteCancelled, toast));

    toast.element.append(input, save, cancel);
    input.focus();
  }

  private async saveNote(value: string, toast: ToastTask) {
    if (!this.lastPick) return;
    const note = value.trim();
    if (!note) return;

    const response = (await browser.runtime.sendMessage({
      type: "UPDATE_SOURCE_NOTE",
      sourceItemId: this.lastPick.sourceItemId,
      note
    } satisfies PickerMessage)) as PickerMessageResponse;

    if (response.status === "error") {
      toast.element.remove();
      this.showToast(response);
      return;
    }

    this.showStatusToast(text.noteSaved, toast);
  }

  private showStatusToast(message: string, toast = this.createToast()) {
    window.clearTimeout(toast.dismissTimer);
    toast.element.innerHTML = "";

    const label = document.createElement("span");
    label.textContent = message;
    toast.element.append(label);
    this.scheduleToastDismiss(toast);
  }

  private scheduleToastDismiss(toast: ToastTask) {
    const scheduleDismissal = () => {
      window.clearTimeout(toast.dismissTimer);
      toast.dismissTimer = window.setTimeout(() => toast.element.remove(), 4_200);
    };

    if (!toast.dismissalBound) {
      toast.dismissalBound = true;
      toast.element.addEventListener("pointerenter", () => window.clearTimeout(toast.dismissTimer));
      toast.element.addEventListener("pointerleave", scheduleDismissal);
    }

    scheduleDismissal();
  }

  private flashRects(rects: DOMRect[] | RectLike[]) {
    const usable = rects.filter((rect) => rect.width > 1 && rect.height > 1).slice(0, 8);
    for (const rect of usable) {
      const mark = document.createElement("div");
      mark.className = "flash-rect";
      mark.style.top = `${rect.top}px`;
      mark.style.left = `${rect.left}px`;
      mark.style.width = `${rect.width}px`;
      mark.style.height = `${rect.height}px`;
      this.overlayLayer.append(mark);
      window.setTimeout(() => mark.remove(), 1500);
    }
  }

  private styles() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .overlay-layer {
        pointer-events: none;
        position: fixed;
        inset: 0;
        z-index: 2147483645;
      }

      .pick-button {
        align-items: center;
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(17, 24, 39, 0.22);
        color: #ffffff;
        cursor: pointer;
        display: inline-flex;
        font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
        gap: 6px;
        height: 32px;
        justify-content: center;
        letter-spacing: 0;
        padding: 0 12px;
        pointer-events: auto;
        position: fixed;
        transition: transform 140ms ease, background 140ms ease;
        z-index: 2147483647;
      }

      .pick-button-mark {
        display: block;
        flex: 0 0 auto;
        height: 18px;
        pointer-events: none;
        width: 18px;
      }

      .pick-button:hover,
      .pick-button:focus-visible {
        background: #30302d;
        outline: none;
        transform: translateY(-1px);
      }

      .pick-button[hidden],
      .bottom-bar[hidden],
      .toast[hidden],
      .camera-frame[hidden] {
        display: none;
      }

      .camera-frame {
        display: none;
      }

      .chat-hover {
        background: #172554;
      }

      .chat-select-marker {
        align-items: center;
        background: #ffffff;
        border: 2px solid #1769ff;
        border-radius: 999px;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
        color: transparent;
        cursor: pointer;
        display: inline-flex;
        height: 24px;
        justify-content: center;
        overflow: hidden;
        pointer-events: auto;
        position: fixed;
        width: 24px;
      }

      .chat-select-marker::after {
        border-bottom: 2px solid #ffffff;
        border-left: 2px solid #ffffff;
        content: "";
        height: 5px;
        opacity: 0;
        transform: translateY(-1px) rotate(-45deg);
        width: 10px;
      }

      .chat-select-marker.selected {
        background: #1769ff;
      }

      .chat-select-marker.selected::after {
        opacity: 1;
      }

      .chat-selection-frame,
      .chat-hover-selection-frame {
        border: 2px solid transparent;
        border-radius: 8px;
        box-sizing: border-box;
        pointer-events: none;
        position: fixed;
        transition: background 140ms ease, border-color 140ms ease;
      }

      .chat-hover-selection-frame {
        background: rgba(23, 105, 255, 0.06);
        border-color: #1769ff;
      }

      .chat-selection-frame.selected {
        background: rgba(23, 105, 255, 0.08);
        border-color: #1769ff;
      }

      .pick-hover-frame,
      .pick-staged-frame {
        background: rgba(23, 105, 255, 0.06);
        border: 2px solid #1769ff;
        border-radius: 8px;
        box-sizing: border-box;
        pointer-events: none;
        position: fixed;
        transition: border-color 140ms ease, background 140ms ease;
      }

      .pick-staged-frame {
        background: rgba(23, 105, 255, 0.1);
      }

      .chat-select-marker:hover,
      .chat-select-marker:focus-visible {
        background: #30302d;
        outline: none;
      }

      .bottom-bar {
        align-items: center;
        background: #1c1c1b;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        bottom: 18px;
        box-shadow: 0 18px 46px rgba(17, 17, 15, 0.26);
        color: #f7f7f4;
        display: flex;
        font: 500 13px/1 ui-sans-serif, system-ui, sans-serif;
        gap: 10px;
        justify-content: flex-start;
        left: 50%;
        max-width: min(860px, calc(100vw - 32px));
        min-height: 48px;
        padding: 8px;
        pointer-events: auto;
        position: fixed;
        transform: translateX(-50%);
        z-index: 2147483647;
      }

      .bottom-bar .mode-title {
        color: #ffffff;
        flex: 0 0 auto;
        font-size: 13px;
        font-weight: 720;
      }

      .bottom-bar .mode-detail {
        color: #989894;
        flex: 1 1 120px;
        font-size: 12px;
        max-width: min(280px, calc(100vw - 220px));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bottom-bar-actions {
        align-items: center;
        display: flex;
        flex: 0 0 auto;
        gap: 6px;
        margin-left: auto;
      }

      .bottom-bar button {
        align-items: center;
        background: #2b2b2a;
        border: 1px solid #3c3c39;
        border-radius: 7px;
        color: #f7f7f4;
        cursor: pointer;
        display: inline-flex;
        font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
        height: 32px;
        justify-content: center;
        padding: 0 13px;
        white-space: nowrap;
      }

      .bottom-bar button[data-variant="primary"] {
        background: #ffffff;
        border-color: #ffffff;
        color: #171716;
      }

      .bottom-bar button[data-variant="cancel"] {
        background: #2b2b2a;
        border-color: #3c3c39;
        color: #f7f7f4;
      }

      .bottom-bar button:disabled,
      .bottom-bar button[data-variant="primary"]:disabled {
        background: #343432;
        border-color: #343432;
        color: #777773;
        cursor: not-allowed;
      }

      .flash-rect {
        display: none;
      }

      .task-stack {
        display: grid;
        gap: 10px;
        pointer-events: auto;
        position: fixed;
        right: 18px;
        top: 18px;
        width: min(396px, calc(100vw - 32px));
        z-index: 2147483647;
      }

      .pick-task {
        align-items: center;
        background: #292928;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        box-shadow: 0 18px 46px rgba(16, 24, 32, 0.26);
        box-sizing: border-box;
        color: #f8f8f4;
        display: grid;
        gap: 10px;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        min-height: 68px;
        padding: 12px;
        position: relative;
      }

      .pick-task.is-loading {
        display: flex;
        justify-content: center;
        height: 68px;
        min-height: 68px;
      }

      .pick-task.is-loading > strong {
        color: #ffffff;
        font: 700 16px/1.2 ui-sans-serif, system-ui, sans-serif;
      }

      .pick-task-spinner {
        animation: pickerSpin 900ms linear infinite;
        border: 3px solid rgba(255, 255, 255, 0.26);
        border-radius: 999px;
        border-top-color: #ffffff;
        height: 24px;
        width: 24px;
      }

      .pick-task-preview,
      .pick-task-fallback {
        align-self: center;
        background: #3a3a37;
        border-radius: 8px;
        display: block;
        height: 44px;
        object-fit: cover;
        width: 44px;
      }

      .pick-task-fallback {
        align-items: center;
        color: #d8d8d1;
        display: inline-flex;
        font: 700 15px/1 ui-sans-serif, system-ui, sans-serif;
        justify-content: center;
      }

      .pick-task-details {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .pick-task-details strong {
        color: #ffffff;
        font: 700 15px/1.2 ui-sans-serif, system-ui, sans-serif;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pick-task-details span,
      .pick-task-book {
        color: #b7b7b0;
        font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      }

      .pick-task-book {
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        display: inline-flex;
        gap: 3px;
        padding: 0;
        text-align: left;
        width: max-content;
      }

      .pick-task-book:hover,
      .pick-task-book:focus-visible { color: #ffffff; outline: none; }
      .pick-task-book svg { fill: none; height: 12px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.2; transition: transform 160ms ease; width: 12px; }
      .pick-task.is-book-open .pick-task-book svg { transform: rotate(180deg); }

      .pick-task-view {
        background: #ffffff;
        border: 0;
        border-radius: 10px;
        color: #11110f;
        cursor: pointer;
        font: 700 13px/1 ui-sans-serif, system-ui, sans-serif;
        height: 36px;
        padding: 0 13px;
      }

      .pick-task-view:hover,
      .pick-task-view:focus-visible { background: #e8e8e2; outline: none; }

      .pick-task.is-failed { border-color: rgba(245, 101, 101, 0.56); }
      .pick-task.is-failed .pick-task-details span { color: #ffb4aa; }

      .pick-task-book-panel {
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        display: grid;
        gap: 9px;
        grid-column: 1 / -1;
        margin-top: 2px;
        padding-top: 10px;
      }
      .pick-task-book-panel[hidden] { display: none; }
      .pick-task-book-head { align-items: center; display: flex; justify-content: space-between; }
      .pick-task-book-head strong { color: #b7b7b0; font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; }
      .pick-task-new-book { background: transparent; border: 0; color: #ffffff; cursor: pointer; font: 650 12px/1 ui-sans-serif, system-ui, sans-serif; padding: 0; }
      .pick-task-book-options { display: grid; gap: 2px; max-height: 132px; overflow: auto; }
      .pick-task-book-option { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #f8f8f4; cursor: pointer; display: flex; font: 600 13px/1 ui-sans-serif, system-ui, sans-serif; justify-content: space-between; min-height: 34px; padding: 0 2px; text-align: left; }
      .pick-task-book-option:hover { background: #343432; }
      .pick-task-book-radio { border: 2px solid #f8f8f4; border-radius: 999px; box-sizing: border-box; height: 18px; position: relative; width: 18px; }
      .pick-task-book-option[aria-pressed="true"] .pick-task-book-radio::after { background: #f8f8f4; border-radius: 999px; content: ""; inset: 3px; position: absolute; }
      .pick-task-new-book-form { display: flex; gap: 6px; }
      .pick-task-new-book-form[hidden] { display: none; }
      .pick-task-new-book-form input { background: transparent; border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 7px; color: #fff; flex: 1; font: 500 12px/1 ui-sans-serif, system-ui, sans-serif; height: 34px; min-width: 0; outline: none; padding: 0 8px; }
      .pick-task-new-book-form button, .pick-task-confirm-book { background: #ffffff; border: 0; border-radius: 10px; color: #11110f; cursor: pointer; font: 700 13px/1 ui-sans-serif, system-ui, sans-serif; height: 36px; padding: 0 13px; }
      .pick-task-confirm-book { width: 100%; }

      .toast {
        align-items: center;
        background: #101820;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        box-sizing: border-box;
        box-shadow: 0 18px 46px rgba(16, 24, 32, 0.26);
        color: #f8fafc;
        display: flex;
        flex-wrap: wrap;
        font: 500 13px/1.25 ui-sans-serif, system-ui, sans-serif;
        gap: 10px;
        padding: 12px;
        pointer-events: auto;
        width: 100%;
      }

      .toast span {
        min-width: 0;
      }

      .toast input {
        background: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 7px;
        color: #101820;
        font: 500 13px/1 ui-sans-serif, system-ui, sans-serif;
        height: 30px;
        min-width: 180px;
        outline: 0;
        padding: 0 9px;
      }

      .toast input:focus {
        border-color: #ffffff;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
      }

      .toast button {
        background: #f8fafc;
        border: 0;
        border-radius: 7px;
        color: #101820;
        cursor: pointer;
        font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
        height: 28px;
        padding: 0 9px;
        white-space: nowrap;
      }

      .toast button:hover,
      .toast button:focus-visible {
        background: #e8e8e2;
        border-color: #d0d0c8;
        color: #101820;
        outline: none;
      }

      .bottom-bar button:hover,
      .bottom-bar button:focus-visible {
        background: #41413e;
        border-color: #555550;
        color: #ffffff;
        outline: none;
      }

      .bottom-bar button[data-variant="primary"]:hover,
      .bottom-bar button[data-variant="primary"]:focus-visible {
        background: #e9e9e4;
        border-color: #e9e9e4;
        color: #171716;
      }

      .bottom-bar button:disabled:hover,
      .bottom-bar button:disabled:focus-visible {
        background: #343432;
        border-color: #343432;
        color: #777773;
      }

      .toast button:disabled {
        background: #94a3b8;
        color: #334155;
        cursor: not-allowed;
      }

      @media (max-width: 520px) {
        .bottom-bar {
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-start;
        }

        .bottom-bar .mode-detail {
          flex: 1 1 auto;
          max-width: none;
        }

        .bottom-bar-actions {
          flex: 1 1 100%;
          margin-left: 0;
          width: 100%;
        }

        .bottom-bar-actions button {
          flex: 1 1 0;
        }

        .bottom-bar-actions button[data-role="select-all"] {
          flex-basis: 100%;
        }

      }

      @keyframes pickerFlash {
        0% { opacity: 0; transform: scale(0.99); }
        14% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.01); }
      }

      @keyframes pickerSpin { to { transform: rotate(360deg); } }
    `;
    return style;
  }
}

function firstUsableRect(rects: DOMRectList): DOMRect | null {
  return Array.from(rects).find((rect) => rect.width > 1 && rect.height > 1) || null;
}

function parentElementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function absoluteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}


function mediaSource(media: HTMLMediaElement): string | undefined {
  return media.currentSrc || media.src || media.querySelector<HTMLSourceElement>("source[src]")?.src || undefined;
}

function videoSource(video: HTMLVideoElement): string | undefined { return mediaSource(video); }

function mediaDuration(media: HTMLMediaElement): number | undefined {
  return Number.isFinite(media.duration) && media.duration >= 0 ? Math.round(media.duration * 100) / 100 : undefined;
}

function chatSelectionKey(message: ChatMessageCandidate): string {
  return message.messageSelector || `${message.provider}:${message.role}:${message.text}`;
}
