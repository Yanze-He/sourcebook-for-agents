import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { chatMessageElement, extractChatMessageFromElement, extractVisibleChat } from "../src/chat/adapters";
import { detectChatProvider, providerLabel } from "../src/chat/recognizer";
import { buildConversationPick, transcriptFromMessages } from "../src/chat/transcript";
import { PICKER_LANGUAGE_KEY, storedPickerLanguage, type UiLanguage } from "../src/shared/i18n";
import { DEFAULT_PICKER_OVERLAY_POSITION, PICKER_OVERLAY_POSITION_KEY, storedPickerOverlayPosition, type PickerOverlayPosition } from "../src/shared/overlay-position";
import { collectPageMetadata, collectVideoCoverCandidates, getFaviconUrl, getPageTitle, getSourceOrigin, uniqueCoverCandidates } from "../src/shared/page";
import { detectPost } from "../src/post/adapters";
import { cssPath, isEditableTarget, isSensitivePage, quoteWithContext, textPositionInBody } from "../src/shared/selector";
import { truncatePickTitle } from "../src/shared/title";
import type { PickerMessage, PickerMessageResponse, PickResponse, ChatMessageCandidate, ChatProvider, PickerMode, PickPayload, CaptureReference } from "../src/shared/types";
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
  note?: string;
  noteEditor?: HTMLElement;
  dismissTimer?: number;
  dismissalBound?: boolean;
  dismissalScheduled?: boolean;
  pointerInside?: boolean;
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
    pickUiMode: "截取",
    pickUiTitle: "点击组件，或拖拽选择区域",
    uiSelected: "已选择范围",
    windowRange: "截取当前窗口",
    capture: "截图",
    uiUnsupported: "这个区域太小，无法捕捉。",
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
    moveFailed: "无法更改 Book",
    addNote: "添加备注",
    addNotePlaceholder: "添加备注...",
    addNoteAria: "为这个 Pick 添加备注",
    notePrefix: "备注：",
    editNoteAria: "编辑备注",
    saveToPrefix: "保存至：",
    save: "保存",
    saveNoteAria: "保存备注",
    noteSaveFailed: "备注保存失败，请重试。",
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
    pickUiMode: "Capture",
    pickUiTitle: "Click a component, or drag to capture an area",
    uiSelected: "Area selected",
    windowRange: "Capture current window",
    capture: "Capture",
    uiUnsupported: "This area is too small to capture.",
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
    moveFailed: "Could not change Book",
    addNote: "Add note",
    addNotePlaceholder: "Add note...",
    addNoteAria: "Add note to this Pick",
    notePrefix: "Note: ",
    editNoteAria: "Edit note",
    saveToPrefix: "Save to: ",
    save: "Save",
    saveNoteAria: "Save note",
    noteSaveFailed: "Note could not be saved. Try again.",
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
  private pickTasks = new Set<PickTask>();
  private overlayLayer = document.createElement("div");
  private uiProcessingShield = document.createElement("div");
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
  private uiHoverElement: HTMLElement | null = null;
  private uiSelectedElement: HTMLElement | null = null;
  private captureBounds: { left: number; top: number; width: number; height: number } | null = null;
  private capturePointerStart: { x: number; y: number } | null = null;
  private captureDragging = false;
  private captureSuppressClick = false;
  // Resize handles are useful while composing a capture, but must never be
  // painted inside the pixels that are saved. The outline itself may stay:
  // CSS draws its stroke outside the exact capture rectangle.
  private captureControlsHidden = false;

  mount() {
    this.host.setAttribute("aria-hidden", "false");
    document.documentElement.append(this.host);
    this.shadow.append(
      this.styles(),
      this.overlayLayer,
      this.uiProcessingShield,
      this.cameraFrame,
      this.selectionToolbar,
      this.hoverButton,
      this.chatHoverButton,
      this.multiPickBar,
      this.taskStack
    );

    this.overlayLayer.className = "overlay-layer";
    this.uiProcessingShield.className = "ui-processing-shield";
    this.uiProcessingShield.hidden = true;
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
    document.addEventListener("pointermove", (event) => this.handleCapturePointerMove(event), true);
    document.addEventListener("pointerup", (event) => this.handlePointerUp(event), true);
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
      if (message.type === "START_UI_PICK_MODE") return Promise.resolve(this.startUiPickMode());
      if (message.type === "CONFIRM_PICK_MODE") return this.confirmStagedPick();
      if (message.type === "GET_PICKER_STATUS") return Promise.resolve(this.getPickerStatus());
      if (message.type === "SET_PICKER_ENABLED") return Promise.resolve(this.setPickerEnabled(message.enabled));
      if (message.type === "START_CHAT_MULTI_PICK") return Promise.resolve(this.startChatMultiPick());
      if (message.type === "CANCEL_CHAT_MULTI_PICK") return Promise.resolve(this.cancelChatMultiPick());
      if (message.type === "CONFIRM_CHAT_MULTI_PICK") return this.pickSelectedChatMessages();
      if (message.type === "SHOW_CONTEXT_PICK_RESULT") {
        this.showContextPickResult(message.payload, message.response);
        return Promise.resolve({ status: "ok" });
      }
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

    if (this.mode === "ui_pick_mode") {
      if (this.updateCaptureDrag(event)) return;
      // A locked range is intentionally quiet: hover feedback only helps
      // before the user has committed to a capture area.
      if (this.captureBounds) {
        this.clearUiFrame("hover");
        return;
      }
      const uiTarget = this.uiTargetFromElement(target);
      if (uiTarget) {
        this.uiHoverElement = uiTarget;
        // Keep the locked selection and the current hover affordance separate
        // so a click can replace the selected capture area.
        this.showUiFrame(uiTarget, "hover");
      } else {
        this.uiHoverElement = null;
        this.clearUiFrame("hover");
      }
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
    if (this.isUiProcessing()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (this.isPickerEvent(event)) return;
    if (this.captureSuppressClick) {
      this.captureSuppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (!this.pickerEnabled) return;
    if (this.mode !== "pick_mode" && this.mode !== "chat_select_mode" && this.mode !== "ui_pick_mode") return;

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

    if (this.mode === "ui_pick_mode") {
      const uiTarget = this.uiTargetFromElement(target);
      if (!uiTarget) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.selectUiTarget(uiTarget);
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
    if (this.isUiProcessing()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (this.isPickerEvent(event)) return;
    if (!this.pickerEnabled || (this.mode !== "pick_mode" && this.mode !== "chat_select_mode" && this.mode !== "ui_pick_mode")) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (this.mode === "ui_pick_mode") {
      this.capturePointerStart = { x: event.clientX, y: event.clientY };
      this.captureDragging = false;
      // A drag starts from a clean selection surface instead of retaining the
      // component hover frame until the pointer has moved several pixels.
      this.clearUiFrame("hover");
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    const shouldBlock =
      this.mode === "chat_select_mode"
        ? Boolean(this.chatTargetFromElement(target))
        : Boolean(this.pickTargetFromElement(target, event));
    if (!shouldBlock) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private handleCapturePointerMove(event: PointerEvent) {
    if (!this.updateCaptureDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private updateCaptureDrag(event: Pick<MouseEvent, "clientX" | "clientY">): boolean {
    if (this.mode !== "ui_pick_mode" || !this.capturePointerStart) return false;
    const dx = event.clientX - this.capturePointerStart.x;
    const dy = event.clientY - this.capturePointerStart.y;
    if (!this.captureDragging && Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return false;
    this.captureDragging = true;
    this.uiSelectedElement = null;
    this.captureBounds = this.normalizedCaptureBounds(this.capturePointerStart.x, this.capturePointerStart.y, event.clientX, event.clientY);
    this.clearUiFrame("hover");
    this.showUiFrame(this.captureBounds, "selected");
    this.renderUiPickBar("selected");
    return true;
  }

  private handlePointerUp(event: PointerEvent) {
    if (this.mode !== "ui_pick_mode" || !this.capturePointerStart) return;
    const started = this.capturePointerStart;
    this.capturePointerStart = null;
    if (!this.captureDragging) return;
    this.captureDragging = false;
    const bounds = this.normalizedCaptureBounds(started.x, started.y, event.clientX, event.clientY);
    if (bounds.width < 24 || bounds.height < 24) return;
    this.captureBounds = bounds;
    this.uiSelectedElement = null;
    this.captureSuppressClick = true;
    this.showUiFrame(bounds, "selected");
    this.renderUiPickBar("selected");
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private handleKeydown(event: KeyboardEvent) {
    if (this.isUiProcessing()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (this.mode === "ui_pick_mode" && this.captureBounds && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void this.saveUiSnapshot();
      return;
    }
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
    if (this.mode === "ui_pick_mode") {
      this.clearUiFrame("hover");
      if (this.captureBounds) this.showUiFrame(this.captureBounds, "selected");
    }
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

  private isolatePickerTextInput(input: HTMLInputElement) {
    // Keep delegated page handlers (for example AI chat shortcuts) from
    // receiving keystrokes or edits made inside Picker's shadow UI.
    for (const type of ["keydown", "keyup", "keypress", "input", "change"]) {
      input.addEventListener(type, (event) => event.stopPropagation());
    }
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

  private uiTargetFromElement(target: Element): HTMLElement | null {
    let candidate: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
    while (candidate && candidate !== document.body) {
      if (candidate === this.host || candidate.closest("sourcebook-picker-root")) return null;
      const tag = candidate.tagName.toLowerCase();
      const rect = candidate.getBoundingClientRect();
      const display = window.getComputedStyle(candidate).display;
      const isInline = display === "inline" || ["span", "strong", "em", "b", "i", "svg", "path", "use"].includes(tag);
      if (!isInline && rect.width >= 48 && rect.height >= 32 && rect.bottom > 0 && rect.top < window.innerHeight && !["html", "body", "script", "style", "meta", "link"].includes(tag)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  private showUiFrame(target: HTMLElement | { left: number; top: number; width: number; height: number }, state: "hover" | "selected") {
    this.clearUiFrame(state);
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target;
    const frame = document.createElement("div");
    frame.className = `ui-pick-frame ${state}`;
    // The frame's geometry is the saved geometry. `outline` intentionally
    // paints outwards, so the visual boundary touches the capture range
    // without becoming part of it.
    frame.style.top = `${rect.top}px`;
    frame.style.left = `${rect.left}px`;
    frame.style.width = `${Math.max(1, rect.width)}px`;
    frame.style.height = `${Math.max(1, rect.height)}px`;
    if (state === "selected" || !this.captureBounds) this.renderCaptureMask(rect);
    if (state === "selected" && !this.captureControlsHidden) this.appendCaptureResizeHandles(frame);
    this.overlayLayer.append(frame);
  }

  private clearUiFrame(state?: "hover" | "selected") {
    const selector = state ? `.ui-pick-frame.${state}` : ".ui-pick-frame";
    for (const frame of Array.from(this.overlayLayer.querySelectorAll(selector))) frame.remove();
    if (!state) this.clearCaptureMask();
  }

  private selectUiTarget(element: HTMLElement) {
    this.uiSelectedElement = element;
    this.uiHoverElement = element;
    this.captureBounds = this.captureBoundsFor(element.getBoundingClientRect());
    this.clearUiFrame("hover");
    this.showUiFrame(this.captureBounds, "selected");
    this.renderUiPickBar("selected");
  }

  private captureBoundsFor(rect: DOMRect | { left: number; top: number; width: number; height: number }) {
    return this.normalizedCaptureBounds(rect.left, rect.top, rect.left + rect.width, rect.top + rect.height);
  }

  private normalizedCaptureBounds(startX: number, startY: number, endX: number, endY: number) {
    const left = Math.max(0, Math.min(startX, endX));
    const top = Math.max(0, Math.min(startY, endY));
    const right = Math.min(window.innerWidth, Math.max(startX, endX));
    const bottom = Math.min(window.innerHeight, Math.max(startY, endY));
    return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  private appendCaptureResizeHandles(frame: HTMLDivElement) {
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
    for (const handle of handles) {
      const control = document.createElement("button");
      control.type = "button";
      control.className = `capture-resize-handle ${handle}`;
      control.setAttribute("aria-label", `Resize capture ${handle}`);
      control.addEventListener("pointerdown", (event) => this.startCaptureResize(event, handle));
      frame.append(control);
    }
  }

  private setCaptureControlsVisible(visible: boolean) {
    this.captureControlsHidden = !visible;
    if (this.captureBounds) this.showUiFrame(this.captureBounds, "selected");
  }

  private startCaptureResize(event: PointerEvent, handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w") {
    const origin = this.captureBounds;
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const minSize = 24;
      let left = origin.left;
      let top = origin.top;
      let right = origin.left + origin.width;
      let bottom = origin.top + origin.height;
      if (handle.includes("w")) left = Math.max(0, Math.min(right - minSize, origin.left + dx));
      if (handle.includes("e")) right = Math.min(window.innerWidth, Math.max(left + minSize, origin.left + origin.width + dx));
      if (handle.includes("n")) top = Math.max(0, Math.min(bottom - minSize, origin.top + dy));
      if (handle.includes("s")) bottom = Math.min(window.innerHeight, Math.max(top + minSize, origin.top + origin.height + dy));
      this.captureBounds = { left, top, width: right - left, height: bottom - top };
      this.showUiFrame(this.captureBounds, "selected");
      this.renderUiPickBar("selected");
    };
    const end = (endEvent: PointerEvent) => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", end, true);
      this.captureSuppressClick = true;
      endEvent.preventDefault();
      endEvent.stopPropagation();
      endEvent.stopImmediatePropagation();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", end, true);
  }

  private renderCaptureMask(bounds?: { left: number; top: number; width: number; height: number }) {
    this.clearCaptureMask();
    const target = bounds || this.captureBounds;
    const regions = target
      ? [
          { top: 0, left: 0, width: window.innerWidth, height: Math.max(0, target.top) },
          { top: target.top, left: 0, width: Math.max(0, target.left), height: target.height },
          { top: target.top, left: target.left + target.width, width: Math.max(0, window.innerWidth - target.left - target.width), height: target.height },
          { top: target.top + target.height, left: 0, width: window.innerWidth, height: Math.max(0, window.innerHeight - target.top - target.height) }
        ]
      : [{ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }];
    for (const region of regions) {
      if (region.width <= 0 || region.height <= 0) continue;
      const mask = document.createElement("div");
      mask.className = "capture-mask-segment";
      mask.style.top = `${region.top}px`;
      mask.style.left = `${region.left}px`;
      mask.style.width = `${region.width}px`;
      mask.style.height = `${region.height}px`;
      this.overlayLayer.append(mask);
    }
  }

  private clearCaptureMask() {
    for (const mask of Array.from(this.overlayLayer.querySelectorAll(".capture-mask-segment"))) mask.remove();
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
    // A Xiaohongshu player frequently exposes only a blob poster on the actual
    // video node. Its note state contains the portable first-frame URL, so reuse
    // the Post detector here as well as in the Pick Post flow. Keeping the node
    // candidates second still preserves an explicit player poster when present.
    const postCoverCandidates = detectPost(document, location.href)?.thumbnailCandidates || [];
    const thumbnailCandidates = uniqueCoverCandidates([
      ...postCoverCandidates,
      ...collectVideoCoverCandidates(video, document, location.href)
    ], location.href);
    return this.basePayload("video", "video", {
      contentText: video.getAttribute("aria-label") || video.title || video.poster || undefined,
      contentUrl,
      thumbnailUrl: thumbnailCandidates[0],
      thumbnailCandidates,
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
    const detected = detectPost(document, location.href);
    if (detected) return this.pickPost(detected);
    const metadata = collectPageMetadata(document);
    const payload = this.basePayload("link", "whole_page", {
      contentUrl: location.href,
      pageMetadata: metadata
    });
    const captured = await this.captureScreenshot({ type: "CAPTURE_PAGE_PREVIEW" });
    if (captured.status === "error") { this.showToast(captured); return captured; }
    if (captured.status !== "captured") return { status: "error", message: text.unsupportedContent };
    payload.thumbnailBase64 = captured.contentBase64;
    payload.thumbnailMimeType = captured.contentMimeType;

    return this.savePick(payload);
  }

  private async pickPost(detected: NonNullable<ReturnType<typeof detectPost>>): Promise<PickerMessageResponse> {
    const metadata = collectPageMetadata();
    const post = detected.post;
    const thumbnailCandidates = uniqueCoverCandidates([detected.thumbnailUrl, ...(detected.thumbnailCandidates || []), metadata.ogImage], location.href);
    return this.savePick(this.basePayload("post", "post", {
      title: post.title,
      contentText: post.bodyText,
      contentUrl: location.href,
      thumbnailUrl: thumbnailCandidates[0],
      thumbnailCandidates,
      post,
      pageMetadata: {
        ...metadata,
        description: post.bodyText.slice(0, 240) || metadata.description
      }
    }));
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

  private startUiPickMode(): PickerMessageResponse {
    if (!this.pickerEnabled) return { status: "error", message: text.enablePicker };
    this.mode = "ui_pick_mode";
    this.uiHoverElement = null;
    this.uiSelectedElement = null;
    this.captureBounds = null;
    this.capturePointerStart = null;
    this.captureDragging = false;
    this.captureControlsHidden = false;
    this.multiSelectMode = false;
    this.selectedChatMessages.clear();
    this.clearMultiPickControls();
    this.clearStagedPick();
    this.clearHoverFrame();
    this.clearUiFrame();
    this.hideSelectionToolbar();
    this.hideHoverButton();
    this.hideChatHoverButton();
    this.renderCaptureMask();
    this.renderUiPickBar("picking");
    return { status: "ok" };
  }

  private stopPickMode(): PickerMessageResponse {
    this.uiProcessingShield.hidden = true;
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
    this.uiHoverElement = null;
    this.uiSelectedElement = null;
    this.captureBounds = null;
    this.capturePointerStart = null;
    this.captureDragging = false;
    this.captureControlsHidden = false;
    this.clearUiFrame();
    return { status: "ok" };
  }

  private renderUiPickBar(state: "picking" | "selected") {
    this.uiProcessingShield.hidden = true;
    this.multiPickBar.innerHTML = "";
    this.multiPickBar.dataset.mode = "ui";
    const title = document.createElement("span");
    title.className = "mode-title";
    title.textContent = state === "selected" ? text.uiSelected : text.pickUiMode;
    const detail = document.createElement("span");
    detail.className = "mode-detail";
    detail.textContent = state === "selected" ? this.captureBoundsLabel() : text.pickUiTitle;
    const actions = document.createElement("div");
    actions.className = "bottom-bar-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.dataset.variant = "primary";
    save.textContent = state === "selected" ? text.capture : text.windowRange;
    save.addEventListener("click", () => void (state === "selected" ? this.saveUiSnapshot() : this.captureCurrentWindow()));
    actions.append(save, this.createBottomBarCloseButton(() => this.cancelPickMode()));
    this.multiPickBar.append(title, detail, actions);
    this.multiPickBar.hidden = false;
  }

  private createBottomBarCloseButton(onClick: () => void) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "bottom-bar-close";
    close.setAttribute("aria-label", text.cancel);
    close.title = text.cancel;
    close.append(this.captureActionIcon("close"));
    close.addEventListener("click", onClick);
    return close;
  }

  private captureActionIcon(kind: "close") {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("viewBox", "0 0 20 20");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m4.5 4.5 11 11m0-11-11 11");
    path.setAttribute("stroke-linecap", "round");
    icon.append(path);
    return icon;
  }

  private async captureCurrentWindow() {
    // A complete viewport needs no crop. Reuse the page-preview capture so we
    // do not decode and re-encode a full-resolution image merely to save all
    // of its pixels again.
    const payload = this.capturePayload({
      contentUrl: `sourcebook://capture/${crypto.randomUUID()}.png`
    });
    const captured = await this.captureScreenshot({ type: "CAPTURE_PAGE_PREVIEW" }, { hideOverlay: true });
    if (captured.status === "error") {
      this.showToast(captured);
      return;
    }
    if (captured.status !== "captured") return;

    payload.contentBase64 = captured.contentBase64;
    payload.contentMimeType = captured.contentMimeType;
    this.beginCaptureSave();
    const response = await this.savePick(payload);
    if ("sourceItemId" in response) this.stopPickMode();
    else this.restoreCaptureAfterSave("picking");
  }

  private captureBoundsLabel() {
    if (!this.captureBounds) return text.pickUiTitle;
    return `${Math.round(this.captureBounds.width)} × ${Math.round(this.captureBounds.height)} px`;
  }

  private async saveUiSnapshot(bounds = this.captureBounds): Promise<void> {
    if (!bounds || bounds.width < 24 || bounds.height < 24) {
      this.showToast({ status: "error", message: text.uiUnsupported });
      return;
    }
    const payload = this.capturePayload();
    const reference = this.captureReferenceFor(bounds);
    this.setCaptureControlsVisible(false);
    const captured = await this.captureScreenshot({ type: "CAPTURE_AREA", capture: reference });
    if (captured.status === "error") {
      this.setCaptureControlsVisible(true);
      this.showToast(captured);
      return;
    }
    if (captured.status !== "captured") {
      this.setCaptureControlsVisible(true);
      return;
    }
    payload.contentBase64 = captured.contentBase64;
    payload.contentMimeType = captured.contentMimeType;
    this.beginCaptureSave();
    const response = await this.savePick(payload);
    if ("sourceItemId" in response) this.stopPickMode();
    else this.restoreCaptureAfterSave("selected");
  }

  private beginCaptureSave() {
    // This only runs after Chrome has returned the frozen screenshot. It can
    // block interaction and show save feedback without becoming part of it.
    this.uiProcessingShield.hidden = false;
    this.multiPickBar.hidden = true;
  }

  private restoreCaptureAfterSave(state: "picking" | "selected") {
    this.uiProcessingShield.hidden = true;
    this.setCaptureControlsVisible(true);
    this.renderUiPickBar(state);
  }

  private async captureScreenshot(
    message: Extract<PickerMessage, { type: "CAPTURE_AREA" | "CAPTURE_PAGE_PREVIEW" }>,
    options: { hideOverlay?: boolean } = {}
  ): Promise<PickerMessageResponse> {
    // The action bar must never become pixels in the saved image. A full-window
    // Capture also hides the selection mask: it is an interaction aid, not part
    // of the source image.
    const wasHidden = this.multiPickBar.hidden;
    const wasOverlayHidden = this.overlayLayer.hidden;
    this.multiPickBar.hidden = true;
    if (options.hideOverlay) this.overlayLayer.hidden = true;
    // One compositor turn is enough for the toolbar to disappear. The old
    // two-frame delay plus an arbitrary timeout made every screenshot feel
    // stalled before the actual capture had even started.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      return await browser.runtime.sendMessage(message) as PickerMessageResponse;
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : text.unsupportedContent };
    } finally {
      this.multiPickBar.hidden = wasHidden;
      this.overlayLayer.hidden = wasOverlayHidden;
    }
  }

  private isUiProcessing() { return false; }

  private capturePayload(overrides: Partial<PickPayload> = {}): PickPayload {
    const title = overrides.title || document.title || "Screenshot";
    return this.basePayload("image", "image", {
      title,
      contentText: title,
      contentUrl: `sourcebook://capture/${crypto.randomUUID()}.webp`,
      pageMetadata: { ...collectPageMetadata(), description: title },
      ...overrides
    });
  }

  private captureReferenceFor(bounds: { left: number; top: number; width: number; height: number }): CaptureReference {
    return {
      bounds: { left: Math.round(bounds.left), top: Math.round(bounds.top), width: Math.round(bounds.width), height: Math.round(bounds.height) },
      viewport: { width: Math.round(window.innerWidth), height: Math.round(window.innerHeight) }
    };
  }

  private getPickerStatus(): PickerMessageResponse {
    const extracted = extractVisibleChat(document);
    const post = detectPost(document, location.href);
    return {
      status: "picker_status",
      mode: this.mode,
      enabled: this.pickerEnabled,
      pageAvailable: true,
      chatProvider: extracted?.provider,
      messageCount: extracted?.messages.length || 0,
      postPlatform: post?.platform,
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

    const cancel = this.createBottomBarCloseButton(() => this.cancelPickMode());

    const actions = document.createElement("div");
    actions.className = "bottom-bar-actions";
    // Keep the close affordance in one predictable place across every Pick
    // bottom bar: the far right, after the action that confirms the pick.
    actions.append(confirm, cancel);

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

    const cancel = this.createBottomBarCloseButton(() => this.cancelChatMultiPickAndOpenPopup());

    this.multiPickBar.innerHTML = "";
    this.multiPickBar.dataset.mode = "chat";
    const actions = document.createElement("div");
    actions.className = "bottom-bar-actions";
    // The close control is intentionally last so it remains the far-right
    // control in both the desktop and condensed bottom-bar layouts.
    actions.append(pickVisible, pickSelected, cancel);

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

  private showContextPickResult(payload: PickPayload, response: PickResponse | { status: "error"; message: string }) {
    this.lastAttemptPayload = payload;
    const task = this.createPickTask(payload);
    if ("sourceItemId" in response) this.lastPick = response;
    void this.completePickTask(task, response);
  }

  private createPickTask(payload: PickPayload): PickTask {
    const element = document.createElement("section");
    element.className = "pick-task is-loading";
    const spinner = document.createElement("span");
    spinner.className = "pick-task-spinner";
    spinner.setAttribute("aria-label", text.saving);
    const label = document.createElement("strong");
    label.textContent = payload.contentUrl?.startsWith("sourcebook://capture/")
      ? text.saving
      : payload.modality === "image"
        ? text.downloading
        : text.saving;
    element.append(spinner, label);
    this.taskStack.append(element);
    const task = { element, payload };
    this.pickTasks.add(task);
    return task;
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
    const rects: Array<[string, string, string, string, string]> = [
      ["36", "60", "42", "28", "5"],
      ["36", "105", "42", "28", "5"],
      ["36", "150", "42", "28", "5"],
      ["66", "36", "166", "166", "15"],
      ["94", "190", "36", "34", "6"],
      ["168", "190", "36", "34", "6"],
    ];
    for (const [x, y, width, height, rx] of rects) body.append(create("rect", { x, y, width, height, rx }));
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
    const bookLabel = document.createElement("span");
    bookLabel.className = "pick-task-book-label";
    bookLabel.textContent = text.saveToPrefix;
    const bookName = document.createElement("span");
    bookName.className = "pick-task-book-name";
    bookName.textContent = currentBookName;
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = '<path d="m7 10 5 5 5-5" />';
    bookToggle.append(bookLabel, bookName, chevron);
    const noteAction = document.createElement("button");
    noteAction.type = "button";
    noteAction.className = "pick-task-note";
    const noteLabel = document.createElement("span");
    noteLabel.className = "pick-task-note-label";
    const noteIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    noteIcon.setAttribute("viewBox", "0 0 24 24");
    noteIcon.setAttribute("aria-hidden", "true");
    const renderNoteAction = () => {
      const hasNote = Boolean(task.note);
      noteLabel.textContent = hasNote ? `${text.notePrefix}${task.note}` : text.addNote;
      noteAction.setAttribute("aria-label", hasNote ? text.editNoteAria : text.addNoteAria);
      noteIcon.innerHTML = hasNote
        ? '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>'
        : '<path d="M12 5v14M5 12h14"/>';
    };
    noteAction.append(noteLabel, noteIcon);
    renderNoteAction();
    const actions = document.createElement("div");
    actions.className = "pick-task-actions";
    actions.append(bookToggle, noteAction);
    details.append(status, actions);

    const chooser = this.createBookChooser(task, currentBookId, books, bookName, bookToggle);
    bookToggle.addEventListener("click", () => {
      const open = chooser.hidden;
      if (open && task.noteEditor) this.closeTaskNoteEditor(task, status, noteAction, bookToggle, renderNoteAction);
      chooser.hidden = !open;
      task.element.classList.toggle("is-book-open", open);
      bookToggle.setAttribute("aria-expanded", String(open));
      if (open) this.pausePickTaskDismissals();
      else this.resumePickTaskDismissals();
    });
    noteAction.addEventListener("click", () => {
      if (task.noteEditor) {
        this.closeTaskNoteEditor(task, status, noteAction, bookToggle, renderNoteAction);
        return;
      }
      chooser.hidden = true;
      task.element.classList.remove("is-book-open");
      bookToggle.setAttribute("aria-expanded", "false");
      this.renderTaskNoteEditor(task, status, noteAction, bookToggle, renderNoteAction);
    });

    task.element.replaceChildren(this.taskPreview(task.payload), details, chooser);
  }

  private renderTaskNoteEditor(
    task: PickTask,
    status: HTMLElement,
    noteAction: HTMLButtonElement,
    bookToggle: HTMLButtonElement,
    renderNoteAction: () => void
  ) {
    if (!task.sourceItemId || task.noteEditor) return;
    this.pausePickTaskDismissals();
    task.element.classList.add("is-note-editing");
    noteAction.disabled = true;
    noteAction.setAttribute("aria-hidden", "true");
    bookToggle.disabled = true;

    const editor = document.createElement("div");
    editor.className = "pick-task-note-editor";
    const input = document.createElement("input");
    input.type = "text";
    input.value = task.note || "";
    input.placeholder = text.addNotePlaceholder;
    input.maxLength = 240;
    input.ariaLabel = text.addNoteAria;
    this.isolatePickerTextInput(input);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "pick-task-note-save";
    save.setAttribute("aria-label", text.saveNoteAria);
    save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    editor.append(input, save);
    task.noteEditor = editor;

    const finish = () => {
      editor.remove();
      task.noteEditor = undefined;
      task.element.classList.remove("is-note-editing");
      noteAction.disabled = false;
      noteAction.removeAttribute("aria-hidden");
      bookToggle.disabled = false;
      status.textContent = text.saved;
      renderNoteAction();
      this.resumePickTaskDismissals();
    };
    const saveEdit = async () => {
      if (!task.sourceItemId || save.disabled) return;
      const note = input.value.trim();
      save.disabled = true;
      try {
        const response = await browser.runtime.sendMessage({
          type: "UPDATE_SOURCE_NOTE",
          sourceItemId: task.sourceItemId,
          bookId: task.sourceBookId,
          note
        } satisfies PickerMessage) as PickerMessageResponse;
        if (response.status === "error") {
          status.textContent = response.message || text.noteSaveFailed;
          save.disabled = false;
          input.focus();
          return;
        }
        task.note = note || undefined;
        finish();
      } catch {
        status.textContent = text.noteSaveFailed;
        save.disabled = false;
        input.focus();
      }
    };

    save.addEventListener("click", () => void saveEdit());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.closeTaskNoteEditor(task, status, noteAction, bookToggle, renderNoteAction);
      }
    });
    task.element.append(editor);
    input.focus();
  }

  private closeTaskNoteEditor(
    task: PickTask,
    status: HTMLElement,
    noteAction: HTMLButtonElement,
    bookToggle: HTMLButtonElement,
    renderNoteAction: () => void
  ) {
    task.noteEditor?.remove();
    task.noteEditor = undefined;
    task.element.classList.remove("is-note-editing");
    noteAction.disabled = false;
    noteAction.removeAttribute("aria-hidden");
    bookToggle.disabled = false;
    status.textContent = text.saved;
    renderNoteAction();
    this.resumePickTaskDismissals();
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
      window.clearTimeout(task.dismissTimer);
      this.pickTasks.delete(task);
      void this.savePick(task.payload);
    });
    task.element.replaceChildren(this.taskPreview(task.payload), details, retry);
    task.dismissalScheduled = true;
    this.resumePickTaskDismissals();
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
    input.type = "text";
    input.placeholder = text.newBookPlaceholder;
    this.isolatePickerTextInput(input);
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
      event.stopPropagation();
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
      if (selectedBookId === task.sourceBookId) { chooser.hidden = true; task.element.classList.remove("is-book-open"); this.resumePickTaskDismissals(); return; }
      confirm.disabled = true;
      const moved = await browser.runtime.sendMessage({ type: "MOVE_PICK_TO_BOOK", sourceItemId: task.sourceItemId, sourceBookId: task.sourceBookId, targetBookId: selectedBookId } satisfies PickerMessage) as PickerMessageResponse;
      if (moved.status === "moved") {
        task.sourceItemId = moved.sourceItemId;
        task.sourceBookId = moved.bookId;
        bookName.textContent = availableBooks.find((book) => book.id === moved.bookId)?.name || bookName.textContent;
        chooser.hidden = true;
        task.element.classList.remove("is-book-open");
        bookToggle.setAttribute("aria-expanded", "false");
        this.resumePickTaskDismissals();
      } else if (moved.status === "error") this.renderFailedTask(task, moved.message || text.moveFailed);
      confirm.disabled = false;
    });
    return chooser;
  }

  private taskPreview(payload: PickPayload): HTMLElement {
    const inlinePreview = payload.thumbnailBase64
      ? `data:${payload.thumbnailMimeType || "image/png"};base64,${payload.thumbnailBase64}`
      : payload.contentBase64 && payload.modality === "image"
        ? `data:${payload.contentMimeType || "image/png"};base64,${payload.contentBase64}`
        : undefined;
    if ((payload.modality === "image" || payload.modality === "video" || payload.modality === "post" || payload.modality === "link") && (inlinePreview || payload.thumbnailUrl || payload.contentUrl)) {
      const image = document.createElement("img");
      image.className = "pick-task-preview";
      image.src = inlinePreview || payload.thumbnailUrl || payload.contentUrl || "";
      image.alt = "";
      image.addEventListener("error", () => image.replaceWith(this.taskPreviewFallback(payload)));
      return image;
    }
    return this.taskPreviewFallback(payload);
  }

  private taskPreviewFallback(payload: PickPayload): HTMLElement {
    const fallback = document.createElement("span");
    fallback.className = "pick-task-fallback";
    fallback.textContent = payload.modality === "video" ? "VID" : "P";
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

  private hasOpenPickTaskPanel(): boolean {
    return Array.from(this.pickTasks).some((task) =>
      task.element.classList.contains("is-book-open") || Boolean(task.noteEditor)
    );
  }

  private pausePickTaskDismissals() {
    for (const task of this.pickTasks) {
      if (task.dismissTimer !== undefined) window.clearTimeout(task.dismissTimer);
      task.dismissTimer = undefined;
    }
  }

  private resumePickTaskDismissals() {
    if (this.hasOpenPickTaskPanel()) return;
    for (const task of this.pickTasks) {
      if (task.dismissalScheduled && task.element.isConnected) this.removeTaskLater(task);
    }
  }

  private removeTaskLater(task: PickTask) {
    const scheduleDismissal = () => {
      if (task.dismissTimer !== undefined) window.clearTimeout(task.dismissTimer);
      task.dismissTimer = undefined;
      task.dismissalScheduled = true;
      if (this.hasOpenPickTaskPanel() || task.pointerInside) return;
      task.dismissTimer = window.setTimeout(() => {
        task.element.remove();
        task.dismissTimer = undefined;
        this.pickTasks.delete(task);
      }, 3_000);
    };

    if (!task.dismissalBound) {
      task.dismissalBound = true;
      task.element.addEventListener("pointerenter", () => {
        task.pointerInside = true;
        if (task.dismissTimer !== undefined) window.clearTimeout(task.dismissTimer);
        task.dismissTimer = undefined;
      });
      task.element.addEventListener("pointerleave", () => {
        task.pointerInside = false;
        scheduleDismissal();
      });
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

      toast.element.append(note);
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
    save.setAttribute("aria-label", text.saveNoteAria);
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
      bookId: this.lastPick.bookId,
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
      .overlay-layer[hidden],
      .toast[hidden],
      .camera-frame[hidden],
      .ui-processing-shield[hidden] {
        display: none;
      }

      .ui-processing-shield {
        background: rgba(12, 12, 11, 0.14);
        cursor: progress;
        inset: 0;
        pointer-events: auto;
        position: fixed;
        z-index: 2147483646;
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

      .ui-pick-frame {
        background: transparent;
        border: 0;
        border-radius: 0;
        box-sizing: border-box;
        outline: 2px solid #1769ff;
        pointer-events: none;
        position: fixed;
        transition: background 110ms ease, border-color 110ms ease;
      }

      .ui-pick-frame.selected {
        outline-width: 3px;
      }

      .capture-mask-segment {
        background: rgba(12, 18, 28, 0.46);
        pointer-events: none;
        position: fixed;
      }

      .capture-resize-handle {
        background: #ffffff;
        border: 2px solid #1769ff;
        border-radius: 999px;
        box-sizing: border-box;
        height: 12px;
        padding: 0;
        pointer-events: auto;
        position: absolute;
        width: 12px;
      }

      /* The centre of each handle sits on the outline. Half of the visual
         control extends outward while the resize point remains exact. */
      .capture-resize-handle.nw { cursor: nwse-resize; left: 0; top: 0; transform: translate(-50%, -50%); }
      .capture-resize-handle.n { cursor: ns-resize; left: 50%; top: 0; transform: translate(-50%, -50%); }
      .capture-resize-handle.ne { cursor: nesw-resize; left: 100%; top: 0; transform: translate(-50%, -50%); }
      .capture-resize-handle.e { cursor: ew-resize; left: 100%; top: 50%; transform: translate(-50%, -50%); }
      .capture-resize-handle.se { cursor: nwse-resize; left: 100%; top: 100%; transform: translate(-50%, -50%); }
      .capture-resize-handle.s { cursor: ns-resize; left: 50%; top: 100%; transform: translate(-50%, -50%); }
      .capture-resize-handle.sw { cursor: nesw-resize; left: 0; top: 100%; transform: translate(-50%, -50%); }
      .capture-resize-handle.w { cursor: ew-resize; left: 0; top: 50%; transform: translate(-50%, -50%); }

      .chat-select-marker:hover,
      .chat-select-marker:focus-visible {
        background: #30302d;
        outline: none;
      }

      .bottom-bar {
        align-items: center;
        backdrop-filter: blur(16px) saturate(112%);
        background: rgba(28, 28, 27, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
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

      .bottom-bar[data-mode="ui"] {
        min-height: 42px;
        padding: 6px 8px;
      }

      .bottom-bar button.bottom-bar-close {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 0;
        color: #f7f7f4;
        display: inline-flex;
        height: 28px;
        justify-content: center;
        padding: 0;
        width: 28px;
      }

      .bottom-bar-actions .bottom-bar-close {
        flex: 0 0 28px;
        margin-left: 2px;
      }

      .bottom-bar button.bottom-bar-close:hover,
      .bottom-bar button.bottom-bar-close:focus-visible {
        background: transparent;
        border-color: transparent;
        color: #ffffff;
        outline: none;
        transform: none;
      }

      .bottom-bar button.bottom-bar-close svg {
        display: block;
        height: 18px;
        width: 18px;
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

      .ui-selected-actions {
        align-items: end;
        display: grid;
        flex: 0 0 auto;
        gap: 6px;
        justify-items: end;
        margin-left: auto;
      }

      .ui-selected-actions .bottom-bar-actions {
        margin-left: 0;
      }

      .ui-hierarchy-guide {
        color: #c9c9c3;
        font: 500 12px/1.35 ui-sans-serif, system-ui, sans-serif;
        max-width: min(500px, calc(100vw - 80px));
        text-align: right;
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

      .button-spinner {
        animation: pickerSpin 720ms linear infinite;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        display: inline-block;
        flex: 0 0 auto;
        height: 12px;
        margin-right: 7px;
        width: 12px;
      }

      .flash-rect {
        display: none;
      }

      .task-stack {
        display: grid;
        gap: 10px;
        pointer-events: auto;
        position: fixed;
        left: 18px;
        top: 18px;
        transform: none;
        width: min(396px, calc(100vw - 36px));
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

      .pick-task.is-saved {
        align-content: start;
        grid-template-rows: auto;
      }
      .pick-task.is-saved.is-book-open,
      .pick-task.is-saved.is-note-editing {
        grid-template-rows: auto auto;
      }
      .pick-task.is-saved > .pick-task-preview,
      .pick-task.is-saved > .pick-task-fallback {
        grid-column: 1;
        grid-row: 1;
      }
      .pick-task.is-saved > .pick-task-details {
        grid-column: 2;
        grid-row: 1;
      }
      .pick-task.is-saved > .pick-task-book-panel,
      .pick-task.is-saved > .pick-task-note-editor {
        grid-row: 2;
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

      .pick-task-actions {
        align-items: center;
        display: flex;
        gap: 12px;
        min-width: 0;
      }
      .pick-task-book {
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        display: inline-flex;
        flex: 1 1 auto;
        gap: 4px;
        min-width: 0;
        padding: 0;
        text-align: left;
      }
      .pick-task-book-label { flex: 0 0 auto; white-space: nowrap; }
      .pick-task-book-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pick-task-book:hover,
      .pick-task-book:focus-visible { color: #ffffff; outline: none; }
      .pick-task-note {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 5px;
        color: #c5c5be;
        cursor: pointer;
        display: flex;
        font: 500 12px/1.25 ui-sans-serif, system-ui, sans-serif;
        flex: 0 1 auto;
        gap: 5px;
        justify-self: start;
        max-width: 48%;
        min-width: 0;
        padding: 1px 0;
        text-align: left;
      }
      .pick-task-note[hidden] { display: none; }
      .pick-task.is-note-editing .pick-task-note { visibility: hidden; }
      .pick-task-note:hover,
      .pick-task-note:focus-visible { color: #ffffff; outline: none; }
      .pick-task-note-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pick-task-note svg {
        fill: none;
        flex: 0 0 13px;
        height: 13px;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
        width: 13px;
      }
      .pick-task-note-editor {
        align-items: center;
        display: flex;
        gap: 6px;
        grid-column: 2 / -1;
        min-width: 0;
      }
      .pick-task-note-editor input {
        background: #20201f;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 7px;
        color: #fff;
        flex: 1 1 auto;
        font: 500 12px/1 ui-sans-serif, system-ui, sans-serif;
        height: 31px;
        min-width: 0;
        outline: none;
        padding: 0 8px;
      }
      .pick-task-note-editor input:focus { border-color: rgba(255, 255, 255, 0.62); }
      .pick-task-note-editor .pick-task-note-save {
        align-items: center;
        background: #f8f8f4;
        border: 0;
        border-radius: 7px;
        color: #171716;
        cursor: pointer;
        display: inline-flex;
        height: 31px;
        justify-content: center;
        padding: 0;
        width: 34px;
      }
      .pick-task-note-save svg {
        fill: none;
        height: 17px;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2.3;
        width: 17px;
      }
      .pick-task-note-editor button:disabled { cursor: wait; opacity: 0.6; }
      .pick-task-book:disabled { cursor: default; opacity: 1; }
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

        .ui-selected-actions {
          align-items: stretch;
          flex: 1 1 100%;
          justify-items: stretch;
          margin-left: 0;
          width: 100%;
        }

        .ui-hierarchy-guide {
          max-width: none;
          text-align: left;
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
