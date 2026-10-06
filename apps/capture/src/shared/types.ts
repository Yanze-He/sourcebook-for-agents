export type PickModality = "text" | "image" | "video" | "link" | "page" | "conversation";

export type PickType = "selection" | "image" | "video" | "link" | "whole_page" | "chat_message" | "selected_messages" | "visible_conversation";

export type TextQuoteSelector = {
  exact: string;
  prefix?: string;
  suffix?: string;
};

export type TextPositionSelector = {
  start: number;
  end: number;
};

export type PickLocator = {
  cssSelector?: string;
  textQuote?: TextQuoteSelector;
  textPosition?: TextPositionSelector;
  imageSelector?: string;
  videoSelector?: string;
  linkSelector?: string;
  chatProvider?: ChatProvider;
  messageSelector?: string;
  messageSelectors?: string[];
  startMessageSelector?: string;
  endMessageSelector?: string;
};

export type PageMetadata = {
  pageTitle?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  siteName?: string;
};

export type ChatProvider =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "deepseek"
  | "doubao"
  | "qianwen"
  | "kimi"
  | "grok"
  | "perplexity";

export type ChatMessageRole = "user" | "assistant" | "system" | "unknown";

export type ChatMessageCandidate = {
  id: string;
  provider: ChatProvider;
  role: ChatMessageRole;
  text: string;
  html?: string;
  markdown?: string;
  messageSelector?: string;
  order: number;
};

export type ConversationPick = {
  provider: ChatProvider;
  messages: ChatMessageCandidate[];
  messageCount: number;
  roleCounts: Record<ChatMessageRole, number>;
};

export type PickerMode = "idle" | "pick_mode" | "chat_select_mode";

export type PickPayload = {
  sourceType: "webpage";
  modality: PickModality;
  pickType: PickType;
  contentText?: string;
  contentUrl?: string;
  thumbnailUrl?: string;
  contentBase64?: string;
  contentMimeType?: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceOrigin: string;
  faviconUrl?: string;
  locator?: PickLocator;
  pageMetadata?: PageMetadata;
  conversation?: ConversationPick;
  capturedAt: string;
  userNote?: string;
};

export type CaptureResponse = {
  cacheState?: 'cached' | 'failed' | 'external_reference' | 'downloading';
  inboxItemId: string;
  resourceId: string;
  pickId: string;
  status: "saved" | "duplicate" | "queued";
};

export type PickerStatusResponse = {
  status: "picker_status";
  mode: PickerMode;
  enabled: boolean;
  pageAvailable: boolean;
  chatProvider?: ChatProvider;
  messageCount: number;
  pendingCount: number;
  pendingCapacity: number;
  browserStoredCount: number;
  localServiceConnected: boolean;
  recentPicks: RecentPickSummary[];
};

export type RecentPickSummary = {
  id: string;
  title: string;
  modality: PickModality;
  status: CaptureResponse["status"];
  sourceOrigin: string;
  capturedAt: string;
  previewText?: string;
  thumbnailUrl?: string;
};

export type CaptureMessage =
  | { type: "CAPTURE_PICK"; payload: PickPayload }
  | { type: "CAPTURE_ACTIVE" }
  | { type: "CAPTURE_PAGE" }
  | { type: "DETECT_CHAT_PAGE" }
  | { type: "CAPTURE_VISIBLE_CHAT" }
  | { type: "START_PICK_MODE" }
  | { type: "STOP_PICK_MODE" }
  | { type: "CONFIRM_PICK_MODE" }
  | { type: "GET_PICKER_STATUS" }
  | { type: "SET_PICKER_ENABLED"; enabled: boolean }
  | { type: "START_CHAT_MULTI_PICK" }
  | { type: "CANCEL_CHAT_MULTI_PICK" }
  | { type: "CONFIRM_CHAT_MULTI_PICK" }
  | { type: "CAPTURE_CONTEXT_IMAGE"; payload: PickPayload }
  | { type: "CAPTURE_CONTEXT_LINK"; payload: PickPayload }
  | { type: "OPEN_INBOX" }
  | { type: "OPEN_PICKER_POPUP" }
  | { type: "UPDATE_INBOX_NOTE"; inboxItemId: string; note: string }
  | { type: "FLUSH_PENDING" };

export type CaptureMessageResponse =
  | CaptureResponse
  | PickerStatusResponse
  | { status: "supported"; provider: ChatProvider; messageCount: number }
  | { status: "unsupported" }
  | { status: "ok" }
  | { status: "error"; message: string };
