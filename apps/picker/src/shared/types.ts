export type PickModality = "text" | "image" | "video" | "audio" | "link" | "post" | "conversation";

export type PickType = "selection" | "image" | "video" | "audio" | "link" | "whole_page" | "post" | "chat_message" | "selected_messages" | "visible_conversation";

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
  audioSelector?: string;
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
  mediaDurationSeconds?: number;
};

export type PostPlatform = "x" | "xiaohongshu";

export type PostAuthor = {
  displayName?: string;
  handle?: string;
  profileUrl?: string;
  avatarUrl?: string;
};

export type PostMedia = {
  kind: "image" | "video";
  sourceUrl?: string;
  thumbnailUrl?: string;
  altText?: string;
};

/** A normalized social post snapshot. Platform-specific details remain versioned in extensions. */
export type PostSnapshot = {
  schemaVersion: 1;
  title?: string;
  bodyText: string;
  author?: Pick<PostAuthor, "displayName" | "handle">;
  publishedAt?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
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
  /** Resolved by the background worker before a Pick is sent to Sourcebook Desktop. */
  bookId?: string;
  sourceType: "webpage";
  modality: PickModality;
  pickType: PickType;
  title?: string;
  contentText?: string;
  contentUrl?: string;
  thumbnailUrl?: string;
  /** Ordered cover candidates collected while the original webpage is still available. */
  thumbnailCandidates?: string[];
  thumbnailBase64?: string;
  thumbnailMimeType?: string;
  contentBase64?: string;
  contentMimeType?: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceOrigin: string;
  faviconUrl?: string;
  locator?: PickLocator;
  pageMetadata?: PageMetadata;
  post?: PostSnapshot;
  conversation?: ConversationPick;
  pickedAt: string;
  userNote?: string;
};

export type ResolvedPickPayload = Omit<PickPayload, "bookId"> & { bookId: string };

export type PickResponse = {
  cacheState?: 'cached' | 'failed' | 'external_reference' | 'downloading' | 'pending';
  sourceItemId: string;
  resourceId: string;
  pickId: string;
  bookId?: string;
  downloadError?: string;
  status: "saved" | "duplicate";
};

export type PickerStatusResponse = {
  status: "picker_status";
  mode: PickerMode;
  enabled: boolean;
  pageAvailable: boolean;
  chatProvider?: ChatProvider;
  messageCount: number;
  postPlatform?: PostPlatform;
  browserStoredCount: number;
  localServiceConnected: boolean;
  recentPicks: RecentPickSummary[];
  activeBookId?: string;
  books?: PickerBook[];
};

export type PickerBook = { id: string; name: string };

export type RecentPickSummary = {
  id: string;
  title: string;
  modality: PickModality;
  status: PickResponse["status"];
  sourceOrigin: string;
  pickedAt: string;
  previewText?: string;
  thumbnailUrl?: string;
  faviconUrl?: string;
};

export type PickerMessage =
  | { type: "SAVE_PICK"; payload: PickPayload }
  | { type: "PICK_ACTIVE" }
  | { type: "PICK_PAGE" }
  | { type: "DETECT_CHAT_PAGE" }
  | { type: "PICK_VISIBLE_CHAT" }
  | { type: "START_PICK_MODE" }
  | { type: "STOP_PICK_MODE" }
  | { type: "CONFIRM_PICK_MODE" }
  | { type: "GET_PICKER_STATUS" }
  | { type: "SET_PICKER_ENABLED"; enabled: boolean }
  | { type: "START_CHAT_MULTI_PICK" }
  | { type: "CANCEL_CHAT_MULTI_PICK" }
  | { type: "CONFIRM_CHAT_MULTI_PICK" }
  | { type: "PICK_CONTEXT_IMAGE"; payload: PickPayload }
  | { type: "PICK_CONTEXT_LINK"; payload: PickPayload }
  | { type: "OPEN_SOURCES"; bookId?: string }
  | { type: "OPEN_PICKER_POPUP" }
  | { type: "UPDATE_SOURCE_NOTE"; sourceItemId: string; note: string }
  | { type: "MOVE_PICK_TO_BOOK"; sourceItemId: string; sourceBookId: string; targetBookId: string }
  | { type: "CREATE_BOOK"; name: string }
  | { type: "SET_ACTIVE_BOOK"; bookId: string };

export type PickerMessageResponse =
  | PickResponse
  | PickerStatusResponse
  | { status: "supported"; provider: ChatProvider; messageCount: number }
  | { status: "unsupported" }
  | { status: "moved"; sourceItemId: string; bookId: string }
  | { status: "book_created"; book: PickerBook }
  | { status: "ok" }
  | { status: "error"; message: string };
