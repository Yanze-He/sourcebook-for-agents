import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { extractChatMessageFromElement, extractVisibleChat } from "../src/chat/adapters";
import { detectChatProvider, providerLabel } from "../src/chat/recognizer";
import { buildConversationPick, transcriptFromMessages } from "../src/chat/transcript";
import { browserLanguage } from "../src/shared/i18n";
import { collectPageMetadata, getFaviconUrl, getPageTitle, getSourceOrigin } from "../src/shared/page";
import { cssPath, isEditableTarget, isSensitivePage, quoteWithContext, textPositionInBody } from "../src/shared/selector";
import type { CaptureMessage, CaptureMessageResponse, CaptureResponse, ChatMessageCandidate, ChatProvider, PickerMode, PickPayload } from "../src/shared/types";

type RectLike = Pick<DOMRect, "top" | "left" | "width" | "height">;
type HoverPickTarget =
  | { kind: "image"; element: HTMLImageElement }
  | { kind: "video"; element: HTMLVideoElement }
  | { kind: "link"; element: HTMLAnchorElement }
  | { kind: "chat"; element: HTMLElement; message: ChatMessageCandidate };

type StagedPick = {
  key: string;
  target: HoverPickTarget;
  payload: PickPayload;
  rects: RectLike[];
  label: string;
};

const PICKER_ENABLED_KEY = "pickerEnabled";
const locale = browserLanguage(() => browser.i18n.getUILanguage());
const text = {
  zh: {
    pick: "Pick",
    pickMessage: "Pick message",
    pickImage: "Pick 图片",
    pickVideo: "Pick 视频",
    pickLink: "Pick 链接",
    unsupportedContent: "这个内容暂时不能 Pick。",
    alreadyStaged: "已在待确认列表中",
    noSelection: "没有可 Pick 的选中文本。",
    invalidSelection: "这段内容不能 Pick。",
    noContent: "没有可 Pick 的内容。",
    enablePicker: "请先在插件窗口开启 Picker。",
    noMessage: "没有可 Pick 的消息。",
    selectedCount: (count: number) => `已选择 ${count} 个`,
    pickModeTitle: "Pick 媒体资源 · 移动鼠标选择图片、视频或链接",
    confirmHint: "确认后保存",
    confirmPick: "确定",
    confirmCount: (_count: number) => "确定",
    clear: "清空",
    done: "完成",
    pickPage: "Pick 页面",
    chooseFirst: "请先点击一个可 Pick 的内容。",
    queuedOne: "已暂存，打开 App 后同步",
    queuedMany: (count: number) => `已暂存 ${count} 个，打开 App 后同步`,
    duplicateOne: "已在 Inbox 中",
    duplicateMany: (count: number) => `${count} 个已在 Inbox 中`,
    savedOne: "已保存到 Inbox",
    savedMany: (count: number) => `已保存 ${count} 个到 Inbox`,
    chatUnsupported: "当前页面还不支持聊天 Pick。",
    noLoadedMessages: "没有找到已加载的聊天消息。",
    noChatSource: "没有识别到聊天来源。",
    selectMessage: "选择消息",
    selectMessagesTitle: (provider: string) => `${provider} · 选择消息`,
    selectedMessagesCount: (count: number) => `已选 ${count} 条`,
    pickSelected: "确定",
    pickVisible: "Pick 所有已加载对话",
    chooseOneMessage: "请至少选择一条消息。",
    retry: "Retry",
    addNote: "Add note",
    openInbox: "Open Inbox",
    addNotePlaceholder: "Add note...",
    addNoteAria: "Add note to this Pick",
    save: "Save",
    cancel: "取消",
    noteCancelled: "已取消 Note",
    noteSaved: "Note 已保存"
  },
  en: {
    pick: "Pick",
    pickMessage: "Pick message",
    pickImage: "Pick image",
    pickVideo: "Pick video",
    pickLink: "Pick link",
    unsupportedContent: "This content cannot be picked yet.",
    alreadyStaged: "Already selected",
    noSelection: "No selected text to Pick.",
    invalidSelection: "This text cannot be picked.",
    noContent: "No Pickable content found.",
    enablePicker: "Turn on Picker in the extension popup first.",
    noMessage: "No message to Pick.",
    selectedCount: (count: number) => `${count} selected`,
    pickModeTitle: "Batch Pick · Move over images, videos, or links",
    confirmHint: "Confirm to save",
    confirmPick: "Confirm",
    confirmCount: (_count: number) => "Confirm",
    clear: "Clear",
    done: "Done",
    pickPage: "Pick page",
    chooseFirst: "Click Pickable content first.",
    queuedOne: "Saved pending. Open the app to sync.",
    queuedMany: (count: number) => `${count} saved pending. Open the app to sync.`,
    duplicateOne: "Already in Inbox",
    duplicateMany: (count: number) => `${count} already in Inbox`,
    savedOne: "Saved to Inbox",
    savedMany: (count: number) => `${count} saved to Inbox`,
    chatUnsupported: "Chat Pick is not supported on this page yet.",
    noLoadedMessages: "No loaded chat messages found.",
    noChatSource: "Chat source was not detected.",
    selectMessage: "Select message",
    selectMessagesTitle: (provider: string) => `${provider} · Select messages`,
    selectedMessagesCount: (count: number) => `${count} selected`,
    pickSelected: "Confirm",
    pickVisible: "Pick all loaded chat",
    chooseOneMessage: "Select at least one message.",
    retry: "Retry",
    addNote: "Add note",
    openInbox: "Open Inbox",
    addNotePlaceholder: "Add note...",
    addNoteAria: "Add note to this Pick",
    save: "Save",
    cancel: "Cancel",
    noteCancelled: "Note cancelled",
    noteSaved: "Note saved"
  }
}[locale];

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    if (isSensitivePage(location.href)) return;

    const picker = new WebPicker();
    picker.mount();
  }
});

class WebPicker {
  private host = document.createElement("canvas-picker-root");
  private shadow = this.host.attachShadow({ mode: "open" });
  private selectionToolbar = document.createElement("button");
  private hoverButton = document.createElement("button");
  private chatHoverButton = document.createElement("button");
  private cameraFrame = document.createElement("div");
  private multiPickBar = document.createElement("div");
  private toast = document.createElement("div");
  private overlayLayer = document.createElement("div");
  private lastHoverTarget: HTMLImageElement | HTMLVideoElement | HTMLAnchorElement | null = null;
  private lastChatTarget: ChatMessageCandidate | null = null;
  private lastCapture: CaptureResponse | null = null;
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
  private toastTimer: number | undefined;

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
      this.toast
    );

    this.overlayLayer.className = "overlay-layer";
    this.selectionToolbar.className = "pick-button selection";
    this.selectionToolbar.textContent = text.pick;
    this.selectionToolbar.type = "button";
    this.selectionToolbar.hidden = true;

    this.hoverButton.className = "pick-button hover";
    this.hoverButton.textContent = text.pick;
    this.hoverButton.type = "button";
    this.hoverButton.hidden = true;

    this.chatHoverButton.className = "pick-button chat-hover";
    this.chatHoverButton.textContent = text.pickMessage;
    this.chatHoverButton.type = "button";
    this.chatHoverButton.hidden = true;

    this.cameraFrame.className = "camera-frame";
    this.cameraFrame.hidden = true;

    this.multiPickBar.className = "bottom-bar";
    this.multiPickBar.hidden = true;

    this.toast.className = "toast";
    this.toast.hidden = true;

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
      if (areaName !== "local" || !changes[PICKER_ENABLED_KEY]) return;
      this.setPickerEnabled(changes[PICKER_ENABLED_KEY].newValue === true);
    });

    browser.runtime.onMessage.addListener((message: CaptureMessage): Promise<CaptureMessageResponse> | undefined => {
      if (message.type === "CAPTURE_ACTIVE") return this.pickActive();
      if (message.type === "CAPTURE_PAGE") return this.pickPage();
      if (message.type === "DETECT_CHAT_PAGE") return Promise.resolve(this.detectChatPage());
      if (message.type === "CAPTURE_VISIBLE_CHAT") return this.pickVisibleChat();
      if (message.type === "START_PICK_MODE") return Promise.resolve(this.startPickMode());
      if (message.type === "STOP_PICK_MODE") return Promise.resolve(this.stopPickMode());
      if (message.type === "CONFIRM_PICK_MODE") return this.confirmStagedPick(false);
      if (message.type === "GET_PICKER_STATUS") return Promise.resolve(this.getPickerStatus());
      if (message.type === "SET_PICKER_ENABLED") return Promise.resolve(this.setPickerEnabled(message.enabled));
      if (message.type === "START_CHAT_MULTI_PICK") return Promise.resolve(this.startChatMultiPick());
      if (message.type === "CANCEL_CHAT_MULTI_PICK") return Promise.resolve(this.cancelChatMultiPick());
      if (message.type === "CONFIRM_CHAT_MULTI_PICK") return this.pickSelectedChatMessages(false);
      return undefined;
    });
  }

  private async loadPickerEnabled() {
    const stored = await browser.storage.local.get(PICKER_ENABLED_KEY);
    this.setPickerEnabled(stored[PICKER_ENABLED_KEY] === true);
  }

  private setPickerEnabled(enabled: boolean): CaptureMessageResponse {
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
      const pickTarget = this.pickTargetFromElement(target);
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

    const image = target?.closest("img");
    if (image && this.isPickableImage(image)) {
      this.scheduleHoverAffordance({ kind: "image", element: image });
      return;
    }

    const video = target?.closest("video");
    if (video && this.isPickableVideo(video)) {
      this.scheduleHoverAffordance({ kind: "video", element: video });
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

    const pickTarget = this.pickTargetFromElement(target);
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
      this.mode === "chat_select_mode" ? Boolean(this.chatTargetFromElement(target)) : Boolean(this.pickTargetFromElement(target));
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

  private pickTargetFromElement(target: Element): HoverPickTarget | null {
    const image = target.closest("img");
    if (image && this.isPickableImage(image)) return { kind: "image", element: image };

    const video = target.closest("video");
    if (video && this.isPickableVideo(video)) return { kind: "video", element: video };

    const link = target.closest("a[href]") as HTMLAnchorElement | null;
    if (link && this.isPickableLink(link)) return { kind: "link", element: link };

    return null;
  }

  private showHoverButton(target: HTMLImageElement | HTMLVideoElement | HTMLAnchorElement, kind: "image" | "video" | "link") {
    const rect = target.getBoundingClientRect();
    this.lastHoverTarget = target;
    this.hoverButton.dataset.kind = kind;
    this.hoverButton.textContent = kind === "image" ? text.pickImage : kind === "video" ? text.pickVideo : text.pickLink;
    this.hoverButton.hidden = false;
    this.hoverButton.style.top = `${Math.max(8, rect.top + 8)}px`;
    this.hoverButton.style.left = `${Math.min(window.innerWidth - 112, Math.max(8, rect.right - 104))}px`;
  }

  private hideHoverButton() {
    this.hoverButton.hidden = true;
    this.lastHoverTarget = null;
  }

  private showChatHoverButton(message: ChatMessageCandidate) {
    const element = message.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector) : null;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    this.lastChatTarget = message;
    this.chatHoverButton.hidden = false;
    this.chatHoverButton.textContent = `Pick ${message.role === "unknown" ? "message" : message.role}`;
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

    if (target.kind === "link") {
      return {
        key: `link:${cssPath(target.element) || target.element.href}`,
        target,
        payload: this.linkPayload(target.element),
        rects: [target.element.getBoundingClientRect()],
        label: "Link"
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

  private isPickableLink(link: HTMLAnchorElement): boolean {
    const text = link.textContent?.trim();
    return Boolean(link.href && text && link.getBoundingClientRect().width > 24);
  }

  private async pickActive(): Promise<CaptureMessageResponse> {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return this.pickSelection();
    }

    return this.pickPage();
  }

  private async pickSelection(): Promise<CaptureMessageResponse> {
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

    const response = await this.capture(payload);
    this.flashRects(Array.from(range.getClientRects()));
    this.hideSelectionToolbar();
    return response;
  }

  private async pickHoverTarget(): Promise<CaptureMessageResponse> {
    const target = this.lastHoverTarget;
    if (!target) return { status: "error", message: text.noContent };

    const response =
      target instanceof HTMLImageElement
        ? await this.pickImage(target)
        : target instanceof HTMLVideoElement
          ? await this.pickVideo(target)
          : await this.pickLink(target);
    this.hideHoverButton();
    return response;
  }

  private async pickImage(image: HTMLImageElement): Promise<CaptureMessageResponse> {
    const rect = image.getBoundingClientRect();
    const response = await this.capture(this.imagePayload(image));
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

  private async pickVideo(video: HTMLVideoElement): Promise<CaptureMessageResponse> {
    const rect = video.getBoundingClientRect();
    const response = await this.capture(this.videoPayload(video));
    this.flashRects([rect]);
    return response;
  }

  private videoPayload(video: HTMLVideoElement): PickPayload {
    const src = videoSource(video) || video.poster || location.href;
    return this.basePayload("video", "video", {
      contentText: video.getAttribute("aria-label") || video.title || video.poster || undefined,
      contentUrl: absoluteUrl(src),
      thumbnailUrl: absoluteUrl(video.poster),
      locator: {
        videoSelector: cssPath(video)
      },
      pageMetadata: {
        ...collectPageMetadata(),
        description: video.getAttribute("aria-label") || video.title || collectPageMetadata().description
      }
    });
  }

  private async pickLink(link: HTMLAnchorElement): Promise<CaptureMessageResponse> {
    const rect = link.getBoundingClientRect();
    const response = await this.capture(this.linkPayload(link));
    this.flashRects([rect]);
    return response;
  }

  private linkPayload(link: HTMLAnchorElement): PickPayload {
    return this.basePayload("link", "link", {
      contentText: link.textContent?.trim() || link.href,
      contentUrl: link.href,
      locator: {
        linkSelector: cssPath(link)
      }
    });
  }

  private async pickPage(): Promise<CaptureMessageResponse> {
    const metadata = collectPageMetadata();
    const payload = this.basePayload("page", "whole_page", {
      contentUrl: location.href,
      thumbnailUrl: metadata.ogImage,
      pageMetadata: metadata
    });

    return this.capture(payload);
  }

  private detectChatPage(): CaptureMessageResponse {
    const extracted = extractVisibleChat(document);
    if (!extracted) return { status: "unsupported" };

    return {
      status: "supported",
      provider: extracted.provider,
      messageCount: extracted.messages.length
    };
  }

  private startPickMode(): CaptureMessageResponse {
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

  private stopPickMode(): CaptureMessageResponse {
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

  private getPickerStatus(): CaptureMessageResponse {
    const extracted = extractVisibleChat(document);
    return {
      status: "picker_status",
      mode: this.mode,
      enabled: this.pickerEnabled,
      pageAvailable: true,
      chatProvider: extracted?.provider,
      messageCount: extracted?.messages.length || 0,
      pendingCount: 0,
      pendingCapacity: 30,
      browserStoredCount: 0,
      localServiceConnected: false,
      recentPicks: []
    };
  }

  private async pickChatMessage(): Promise<CaptureMessageResponse> {
    const message = this.lastChatTarget;
    if (!message) return { status: "error", message: text.noMessage };

    const response = await this.captureSingleChatMessage(message);
    this.hideChatHoverButton();
    return response;
  }

  private async captureSingleChatMessage(message: ChatMessageCandidate): Promise<CaptureMessageResponse> {
    const response = await this.captureChatMessages([message], "chat_message");
    this.flashChatMessages([message]);
    return response;
  }

  private renderPickModeBar() {
    this.multiPickBar.innerHTML = "";

    const stagedCount = this.stagedPicks.length;
    const title = document.createElement("span");
    title.textContent = stagedCount ? text.selectedCount(stagedCount) : text.pickModeTitle;

    const hint = document.createElement("strong");
    hint.textContent = stagedCount ? this.stagedPicks.map((item) => item.label).join(" / ") : text.confirmHint;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = stagedCount === 1 ? text.confirmPick : text.confirmCount(stagedCount);
    confirm.addEventListener("click", () => void this.confirmStagedPick(true));

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.variant = "cancel";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.cancelPickMode());

    this.multiPickBar.append(title, hint, confirm, cancel);
    this.multiPickBar.hidden = false;
  }

  private cancelPickMode() {
    this.stopPickMode();
    this.openPickerPopup();
  }

  private async confirmStagedPick(reopenPopup: boolean): Promise<CaptureMessageResponse> {
    if (!this.stagedPicks.length) {
      this.stopPickMode();
      if (reopenPopup) this.openPickerPopup();
      return { status: "ok" };
    }

    const stagedItems = this.stagedPicks.slice();
    let response: CaptureMessageResponse = { status: "ok" };
    const statuses: string[] = [];
    for (const staged of stagedItems) {
      response = await this.capture(staged.payload, false);
      statuses.push(response.status);
    }

    this.flashRects(stagedItems.flatMap((staged) => staged.rects));
    this.clearStagedPick();
    this.showStatusToast(this.confirmationMessage(stagedItems.length, statuses));
    this.stopPickMode();
    if (reopenPopup) this.openPickerPopup();
    return response;
  }

  private confirmationMessage(count: number, statuses: string[]): string {
    if (statuses.every((status) => status === "queued")) return count === 1 ? text.queuedOne : text.queuedMany(count);
    if (statuses.every((status) => status === "duplicate")) return count === 1 ? text.duplicateOne : text.duplicateMany(count);
    return count === 1 ? text.savedOne : text.savedMany(count);
  }

  private async pickVisibleChat(): Promise<CaptureMessageResponse> {
    const extracted = extractVisibleChat(document);
    if (!extracted) return { status: "error", message: text.chatUnsupported };
    if (!extracted.messages.length) return { status: "error", message: text.noLoadedMessages };

    const response = await this.captureChatMessages(extracted.messages, "visible_conversation", extracted.provider);
    this.flashChatMessages(extracted.messages);
    return response;
  }

  private startChatMultiPick(): CaptureMessageResponse {
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

  private cancelChatMultiPick(): CaptureMessageResponse {
    if (this.mode === "chat_select_mode") this.mode = "idle";
    this.multiSelectMode = false;
    this.selectedChatMessages.clear();
    this.chatSelectionHoverId = null;
    this.clearMultiPickControls();
    return { status: "ok" };
  }

  private async captureChatMessages(
    messages: ChatMessageCandidate[],
    pickType: "chat_message" | "selected_messages" | "visible_conversation",
    providerOverride?: ChatProvider
  ): Promise<CaptureMessageResponse> {
    const payload = this.chatMessagesPayload(messages, pickType, providerOverride);
    if (!payload) return { status: "error", message: text.noChatSource };

    return this.capture(payload);
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
    title.textContent = text.selectMessagesTitle(providerLabel(provider));

    const count = document.createElement("strong");
    count.dataset.role = "count";
    count.textContent = text.selectedMessagesCount(this.selectedChatMessages.size);

    const pickSelected = document.createElement("button");
    pickSelected.type = "button";
    pickSelected.textContent = text.pickSelected;
    pickSelected.addEventListener("click", () => void this.pickSelectedChatMessages(true));

    const pickVisible = document.createElement("button");
    pickVisible.type = "button";
    pickVisible.textContent = text.pickVisible;
    pickVisible.addEventListener("click", () => void this.pickVisibleChatFromSelectionMode());

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.variant = "cancel";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.cancelChatMultiPickAndOpenPopup());

    this.multiPickBar.innerHTML = "";
    this.multiPickBar.append(title, count, pickSelected, pickVisible, cancel);
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
    const count = this.multiPickBar.querySelector<HTMLElement>('[data-role="count"]');
    if (count) count.textContent = text.selectedMessagesCount(this.selectedChatMessages.size);
  }

  private async pickSelectedChatMessages(reopenPopup: boolean): Promise<CaptureMessageResponse> {
    const selected = Array.from(this.selectedChatMessages.values()).sort((a, b) => a.order - b.order);
    if (!selected.length) {
      const error = { status: "error" as const, message: text.chooseOneMessage };
      this.showToast(error);
      return error;
    }

    const response = await this.captureChatMessages(selected, "selected_messages");
    this.flashChatMessages(selected);
    this.cancelChatMultiPick();
    if (reopenPopup) this.openPickerPopup();
    return response;
  }

  private cancelChatMultiPickAndOpenPopup() {
    this.cancelChatMultiPick();
    this.openPickerPopup();
  }

  private async pickVisibleChatFromSelectionMode(): Promise<CaptureMessageResponse> {
    const response = await this.pickVisibleChat();
    if (response.status !== "error" && response.status !== "unsupported") {
      this.cancelChatMultiPick();
      this.openPickerPopup();
    }
    return response;
  }

  private openPickerPopup() {
    void browser.runtime.sendMessage({ type: "OPEN_PICKER_POPUP" } satisfies CaptureMessage);
  }

  private chatTargetFromElement(target: Element): { element: HTMLElement; message: ChatMessageCandidate } | null {
    const provider = detectChatProvider(location.href);
    if (provider) {
      const message = extractChatMessageFromElement(provider, target, document);
      const element = message?.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector) : null;
      if (message && element) return { element, message };
    }

    const extracted = this.getCachedChatMessages();
    if (!extracted.length) return null;

    for (const message of extracted) {
      const element = message.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector) : null;
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
      const element = message.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector) : null;
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
      .map((message) => (message.messageSelector ? document.querySelector<HTMLElement>(message.messageSelector)?.getBoundingClientRect() : undefined))
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
      capturedAt: new Date().toISOString(),
      ...overrides
    };
  }

  private async capture(payload: PickPayload, showFeedback = true): Promise<CaptureMessageResponse> {
    this.lastAttemptPayload = payload;
    const response = (await browser.runtime.sendMessage({
      type: "CAPTURE_PICK",
      payload
    } satisfies CaptureMessage)) as CaptureMessageResponse;

    if ("inboxItemId" in response) this.lastCapture = response;
    if (showFeedback) this.showToast(response);
    return response;
  }

  private showToast(response: CaptureMessageResponse) {
    window.clearTimeout(this.toastTimer);
    const message =
      response.status === "queued"
        ? text.queuedOne
        : response.status === "duplicate"
          ? text.duplicateOne
        : response.status === "error"
          ? response.message
          : text.savedOne;

    this.toast.hidden = false;
    this.toast.innerHTML = "";

    const label = document.createElement("span");
    label.textContent = message;
    this.toast.append(label);

    if (response.status === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = text.retry;
      retry.disabled = !this.lastAttemptPayload;
      retry.addEventListener("click", () => {
        if (this.lastAttemptPayload) void this.capture(this.lastAttemptPayload);
      });
      this.toast.append(retry);
    } else {
      const note = document.createElement("button");
      note.type = "button";
      note.textContent = text.addNote;
      note.addEventListener("click", () => this.renderNoteEditor());

      const open = document.createElement("button");
      open.type = "button";
      open.textContent = text.openInbox;
      open.addEventListener("click", () => void browser.runtime.sendMessage({ type: "OPEN_INBOX" } satisfies CaptureMessage));

      this.toast.append(note, open);
    }

    this.scheduleToastDismiss();
  }

  private renderNoteEditor() {
    if (!this.lastCapture) return;
    window.clearTimeout(this.toastTimer);

    this.toast.innerHTML = "";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = text.addNotePlaceholder;
    input.maxLength = 240;
    input.ariaLabel = text.addNoteAria;

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = text.save;
    save.addEventListener("click", () => void this.saveNote(input.value));

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = text.cancel;
    cancel.addEventListener("click", () => this.showStatusToast(text.noteCancelled));

    this.toast.append(input, save, cancel);
    input.focus();
  }

  private async saveNote(value: string) {
    if (!this.lastCapture) return;
    const note = value.trim();
    if (!note) return;

    const response = (await browser.runtime.sendMessage({
      type: "UPDATE_INBOX_NOTE",
      inboxItemId: this.lastCapture.inboxItemId,
      note
    } satisfies CaptureMessage)) as CaptureMessageResponse;

    if (response.status === "error") {
      this.showToast(response);
      return;
    }

    this.showStatusToast(text.noteSaved);
  }

  private showStatusToast(message: string) {
    window.clearTimeout(this.toastTimer);
    this.toast.hidden = false;
    this.toast.innerHTML = "";

    const label = document.createElement("span");
    label.textContent = message;
    this.toast.append(label);
    this.scheduleToastDismiss();
  }

  private scheduleToastDismiss() {
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, 4200);
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

      .pick-button:hover,
      .pick-button:focus-visible {
        background: #0f766e;
        outline: 2px solid #99f6e4;
        outline-offset: 2px;
        transform: translateY(-1px);
      }

      .pick-button[hidden],
      .bottom-bar[hidden],
      .toast[hidden],
      .camera-frame[hidden] {
        display: none;
      }

      .camera-frame {
        border: 1px solid rgba(15, 118, 110, 0.22);
        border-radius: 16px;
        background:
          linear-gradient(#0f766e, #0f766e) left 10px top 10px / 42px 3px no-repeat,
          linear-gradient(#0f766e, #0f766e) left 10px top 10px / 3px 42px no-repeat,
          linear-gradient(#0f766e, #0f766e) right 10px top 10px / 42px 3px no-repeat,
          linear-gradient(#0f766e, #0f766e) right 10px top 10px / 3px 42px no-repeat,
          linear-gradient(#0f766e, #0f766e) left 10px bottom 10px / 42px 3px no-repeat,
          linear-gradient(#0f766e, #0f766e) left 10px bottom 10px / 3px 42px no-repeat,
          linear-gradient(#0f766e, #0f766e) right 10px bottom 10px / 42px 3px no-repeat,
          linear-gradient(#0f766e, #0f766e) right 10px bottom 10px / 3px 42px no-repeat;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.55),
          0 18px 60px rgba(15, 23, 42, 0.18);
        box-sizing: border-box;
        height: calc(100vh - 28px);
        left: 14px;
        pointer-events: none;
        position: fixed;
        top: 14px;
        width: calc(100vw - 28px);
        z-index: 2147483644;
      }

      .chat-hover {
        background: #172554;
      }

      .chat-select-marker {
        align-items: center;
        background: #ffffff;
        border: 2px solid #0f766e;
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
        background: #0f766e;
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
        background: rgba(20, 184, 166, 0.06);
        border-color: rgba(15, 118, 110, 0.34);
      }

      .chat-selection-frame.selected {
        background: rgba(20, 184, 166, 0.08);
        border-color: rgba(15, 118, 110, 0.72);
      }

      .pick-hover-frame,
      .pick-staged-frame {
        border-radius: 8px;
        box-sizing: border-box;
        pointer-events: none;
        position: fixed;
        z-index: 2147483646;
      }

      .pick-hover-frame {
        background: rgba(20, 184, 166, 0.07);
        border: 2px solid rgba(15, 118, 110, 0.42);
      }

      .pick-staged-frame {
        background: rgba(20, 184, 166, 0.13);
        border: 2px solid rgba(15, 118, 110, 0.9);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
      }

      .chat-select-marker:hover,
      .chat-select-marker:focus-visible {
        outline: 2px solid #99f6e4;
        outline-offset: 2px;
      }

      .bottom-bar {
        align-items: center;
        background: #101820;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        bottom: 18px;
        box-shadow: 0 18px 46px rgba(16, 24, 32, 0.26);
        color: #f8fafc;
        display: flex;
        flex-wrap: wrap;
        font: 500 13px/1.25 ui-sans-serif, system-ui, sans-serif;
        gap: 8px;
        justify-content: center;
        left: 50%;
        max-width: min(760px, calc(100vw - 32px));
        padding: 10px;
        pointer-events: auto;
        position: fixed;
        transform: translateX(-50%);
        z-index: 2147483647;
      }

      .bottom-bar span {
        max-width: min(280px, calc(100vw - 64px));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bottom-bar strong {
        color: #99f6e4;
        font-size: 12px;
        max-width: min(220px, calc(100vw - 64px));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bottom-bar button {
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

      .bottom-bar button[data-variant="cancel"] {
        background: transparent;
        border: 1px solid rgba(248, 250, 252, 0.36);
        color: #f8fafc;
      }

      .flash-rect {
        animation: pickerFlash 1500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        background: rgba(20, 184, 166, 0.18);
        border: 2px solid rgba(15, 118, 110, 0.78);
        border-radius: 6px;
        box-sizing: border-box;
        position: fixed;
      }

      .toast {
        align-items: center;
        background: #101820;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        bottom: 18px;
        box-shadow: 0 18px 46px rgba(16, 24, 32, 0.26);
        color: #f8fafc;
        display: flex;
        flex-wrap: wrap;
        font: 500 13px/1.25 ui-sans-serif, system-ui, sans-serif;
        gap: 10px;
        max-width: min(420px, calc(100vw - 32px));
        padding: 12px;
        pointer-events: auto;
        position: fixed;
        right: 18px;
        z-index: 2147483647;
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
        border-color: #5eead4;
        box-shadow: 0 0 0 2px rgba(94, 234, 212, 0.35);
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
      .toast button:focus-visible,
      .bottom-bar button:hover,
      .bottom-bar button:focus-visible {
        background: #ccfbf1;
        color: #101820;
        outline: 2px solid #5eead4;
        outline-offset: 2px;
      }

      .toast button:disabled {
        background: #94a3b8;
        color: #334155;
        cursor: not-allowed;
      }

      @media (max-width: 520px) {
        .bottom-bar {
          align-items: stretch;
          flex-wrap: wrap;
          justify-content: center;
        }

        .bottom-bar span {
          flex: 1 1 100%;
          text-align: center;
          white-space: normal;
        }

        .toast {
          left: 16px;
          right: 16px;
        }
      }

      @keyframes pickerFlash {
        0% { opacity: 0; transform: scale(0.99); }
        14% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.01); }
      }
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

function absoluteUrl(url: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function videoSource(video: HTMLVideoElement): string | undefined {
  return video.currentSrc || video.src || video.querySelector<HTMLSourceElement>("source[src]")?.src || undefined;
}

function chatSelectionKey(message: ChatMessageCandidate): string {
  return message.messageSelector || `${message.provider}:${message.role}:${message.text}`;
}
