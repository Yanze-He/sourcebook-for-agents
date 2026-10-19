import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, ArrowRightLeft, Check, ChevronDown, CircleCheck, CircleHelp, CircleX, CloudOff, Copy, Download, EllipsisVertical, ExternalLink, Eye, FilePlus2, FileText, FileUp, FileWarning, Funnel, Globe2, HardDrive, Image, Info, Languages, Link2, Link2Off, ListChecks, LoaderCircle, Maximize2, MessageSquare, Music2, Package, Pencil, Play, Plus, Puzzle, RefreshCw, Search, Send, Settings, Sparkles, Star, Trash2, Upload, Video, Workflow, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import TurndownService from "turndown";
import { tables as turndownTables } from "turndown-plugin-gfm";

type Language = "en" | "zh";
type Modality = "text" | "image" | "video" | "audio" | "file" | "link" | "post" | "conversation";
type LocalCopyState = "pending" | "cached" | "downloading" | "failed" | "missing" | null;
type LinkState = "linked" | "invalid" | "none";
type SourceItem = { id: string; bookId: string; resourceId: string; itemTitle: string; userNote: string; status: string; pickedAt: string; favorite: boolean; modality: Modality; pickType: string; resourceSummary: string; contentText: string | null; contentUrl: string | null; thumbnailUrl: string | null; sourceUrl: string; sourceTitle: string; sourceOrigin: string; faviconUrl: string | null; assetId: string | null; mimeType: string | null; fileName: string | null; localPath: string | null; fileSize: number | null; assetCacheState: LocalCopyState; linkState: LinkState; metadata: { description?: string; pageTitle?: string; ogTitle?: string; siteName?: string; canonicalUrl?: string; ogImage?: string; mediaPreviewUrl?: string; videoPreviewUrl?: string; mediaDurationSeconds?: number; conversation?: { provider?: string }; post?: { title?: string; bodyText?: string; author?: { displayName?: string; handle?: string }; publishedAt?: string; tags?: string[] } } };
type SourcePack = { id: string; warnings: string[] };
type CardDensity = "compact" | "standard" | "spacious";
type LibrarySettingsResponse = { libraryRoot: string; defaultRoot: string; configured: boolean; requiresSetup: boolean; isEmpty: boolean };
type UpdateSettingsResponse = { version: string; build?: string; autoCheck: boolean; lastCheckedAt?: string; release?: { version: string; publishedAt: string; name: string; notes: string; url: string } | null; status?: "idle" | "upToDate" | "available" | "error"; error?: string };
type SourcePage = { items: SourceItem[]; total: number; nextCursor: string | null; limit: number };
const sourcePageSize = 60;
const bookSourceLimit = 200;
type TemplateId = "none" | "continue-agent" | "build-app-site" | "promo-video" | "creative-direction-deck";
type TemplateField = { key: string; label: string; placeholder: string; type?: "text" | "textarea" | "select"; options?: { value: string; label: string }[] };
type PackTemplate = { id: TemplateId; title: string; description: string; fields: TemplateField[]; defaults: Record<string, string>; build: (values: Record<string, string>) => string[] };
const LanguageContext = createContext<Language>("en");
function useLanguage() { return useContext(LanguageContext); }
type DateFilter = "all" | "today" | "yesterday" | "week" | "custom";
type LinkFilter = "all" | "linked" | "invalid";
type LocalFilter = "all" | "pending" | "local" | "missing" | "failed" | "downloading";
type Book = { id: string; name: string; createdAt?: string };
type BookManifest = { activeBookId: string; books: Book[]; unreadBookIds?: string[] };
type BackupRestoreResponse = BookManifest & { imported?: Book[] };
type PromptSettingsResponse = { template: string };
type MCPSettingsResponse = { enabled: boolean; enabledAt?: string; serviceReady: boolean; guideUrl: string; installReady: boolean; agentVersion?: string; installGuides?: { codex?: string; workbuddy?: string } };
type MCPSuggestion = { id: string; kind: "create_text_source" | "import_local_file" | "update_source_metadata" | "pack"; payload: Record<string, unknown>; sourceItemIds: string[]; agentName: string; createdAt: string; status: "pending" | "accepted" | "rejected" | "stale"; reviewedAt?: string; reviewError?: string };
type MCPSuggestionEntry = { book: { id: string; name: string }; suggestion: MCPSuggestion };
type MCPSuggestionsResponse = { suggestions: MCPSuggestionEntry[] };
type AgentInstallTarget = "codex" | "workbuddy";

const interfaceCopy = {
  en: {
    showing: "Showing", search: "Search sources", filter: "Filter", favorites: "Favorites only", masonry: "Masonry view", list: "List view", refresh: "Refresh sources", noSources: "No sources yet", noMatches: "No matching sources", emptyGuide: "Use the Picker extension to collect web content or import local files.", tryAnother: "Try another search or filter.", settings: "Settings", setting: "Setting", promptSettings: "Prompt settings", help: "Help", feedback: "Feedback", installPicker: "Install Picker", switchLanguage: "中文", switchBook: "Switch Sourcebook", importLocalFiles: "Import local files", addText: "Record", textTitle: "Title (optional)", textContent: "Text", createText: "Create record", clearSearch: "Clear search",
    close: "Close", cancel: "Cancel", save: "Save", delete: "Delete", copy: "Copy", copyFiles: "Copy files", copyLink: "Copy link", select: "Select", selected: "Selected", unselect: "Unselect", edit: "Edit", loading: "Loading…", loadMore: "Load more", loadingSources: "Loading sources", readingSources: "Reading from your local Sourcebook.", selectAll: "Select all", clearSelection: "Clear selection", clear: "Cancel", addNote: "Add note", addToOtherBook: "Add to another Book", packForAgent: "Pack for agent", sourcesSelected: "sources selected", sourceSelected: "source selected", note: "Note", info: "Info", source: "Source", picked: "Picked", format: "Format", size: "Size", localLink: "Local link", webLink: "Web link", localFile: "Local file", link: "Link", post: "Post", image: "Image", video: "Video", audio: "Audio", text: "Text", chat: "Chat", file: "File", cover: "Cover", open: "Open", visit: "Visit", view: "View", play: "Play", download: "Download", downloading: "Downloading", missing: "Missing", fileMissing: "File missing", downloadFailed: "Download failed", retry: "Retry", invalid: "Invalid", invalidLink: "Invalid link", copyForAgent: "Copy for agent", openDetail: "Open source detail", closeDetail: "Close detail", addFavorite: "Add to favorites", removeFavorite: "Remove from favorites", editTitle: "Edit title", saveTitle: "Save title", cancelTitleEdit: "Cancel title edit", sourceTitle: "Source title", showInFolder: "Show in folder", viewLocalFile: "View local file", downloadAgain: "Download this file again", retryDownload: "Retry download", downloadLocalFile: "Download local file", moveTo: "Move to…", confirmDelete: "Confirm delete", deleteSources: "Delete sources", deleteBook: "Delete Book", bookSetting: "Book Setting", newBook: "New Book", bookName: "Book name", createBook: "Create Book", targetBook: "Target Book", copyHere: "Copy here", moveHere: "Move here", exportBackup: "Export backup", importBackup: "Import backup", selectBooksToExport: "Select Books to export", selectedBooks: "Books selected", exportSelectedBooks: "Export selected Books", clearLocalData: "Clear local data", markdownContent: "Markdown content", mediaPreview: "Media preview", closePreview: "Close preview", downloadImage: "Download image", downloadMissingFile: "Download missing file?", imageDownloadMessage: "Sourcebook will save a local copy of this image in the current Book.", missingDownloadMessage: "A local copy is missing. Sourcebook will download it again into this Book.", addContext: "Add context for the agent…", noteHelp: "This note is added to the Pack prompt so the agent can understand your intent.", notSavedLocally: "Not saved locally",
  },
  zh: {
    showing: "显示", search: "搜索素材", filter: "筛选", favorites: "仅看收藏", masonry: "瀑布流视图", list: "列表视图", refresh: "刷新素材", noSources: "还没有素材", noMatches: "没有匹配的素材", emptyGuide: "使用 Picker插件获取网页内容 或 导入本地文件", tryAnother: "请尝试其他搜索词或筛选条件。", settings: "设置", setting: "设置", promptSettings: "提示词设置", help: "帮助", feedback: "反馈", installPicker: "安装Picker", switchLanguage: "English", switchBook: "切换 Sourcebook", importLocalFiles: "导入本地文件", addText: "记录", textTitle: "标题（选填）", textContent: "文本内容", createText: "创建记录", clearSearch: "清空搜索",
    close: "关闭", cancel: "取消", save: "保存", delete: "删除", copy: "复制", copyFiles: "复制文件", copyLink: "复制链接", select: "选择", selected: "已选择", unselect: "取消选择", edit: "编辑", loading: "加载中…", loadMore: "加载更多", loadingSources: "正在加载素材", readingSources: "正在读取本地 Sourcebook。", selectAll: "全选", clearSelection: "取消全选", clear: "取消选择", addNote: "添加备注", addToOtherBook: "添加到其他 Book", packForAgent: "发送给 Agent", sourcesSelected: "个素材已选择", sourceSelected: "个素材已选择", note: "备注", info: "信息", source: "来源", picked: "Pick时间", format: "格式", size: "大小", localLink: "本地链接", webLink: "网页链接", localFile: "本地文件", link: "链接", image: "图片", video: "视频", audio: "音频", text: "文本", chat: "对话", file: "文件", cover: "封面", open: "打开", visit: "跳转", view: "查看", play: "播放", download: "下载", downloading: "下载中", missing: "文件丢失", fileMissing: "文件丢失", downloadFailed: "下载失败", retry: "重试", invalid: "无效", invalidLink: "链接无效", copyForAgent: "复制给 Agent", openDetail: "打开素材详情", closeDetail: "关闭详情", addFavorite: "收藏", removeFavorite: "取消收藏", editTitle: "编辑标题", saveTitle: "保存标题", cancelTitleEdit: "取消编辑标题", sourceTitle: "素材标题", showInFolder: "在文件夹中显示", viewLocalFile: "查看本地文件", downloadAgain: "重新下载此文件", retryDownload: "重试下载", downloadLocalFile: "下载本地文件", moveTo: "移动到…", confirmDelete: "确认删除", deleteSources: "删除素材", deleteBook: "删除 Book", bookSetting: "Book 设置", newBook: "新建 Book", bookName: "Book 名称", createBook: "创建 Book", targetBook: "目标 Book", copyHere: "复制到这里", moveHere: "移动到这里", exportBackup: "导出备份", importBackup: "导入备份", selectBooksToExport: "选择要导出的 Book", selectedBooks: "已选择 Book", exportSelectedBooks: "导出所选 Book", clearLocalData: "清空本地数据", markdownContent: "Markdown 内容", mediaPreview: "媒体预览", closePreview: "关闭预览", downloadImage: "下载图片", downloadMissingFile: "下载丢失文件？", imageDownloadMessage: "Sourcebook 会将此图片的本地副本保存到当前 Book。", missingDownloadMessage: "本地副本已丢失，Sourcebook 将重新下载到当前 Book。", addContext: "补充给 Agent 的上下文…", noteHelp: "此备注会加入 Pack 提示词，帮助 Agent 更好理解你的意图。", notSavedLocally: "尚未保存到本地",
  },
} as const;

function packTemplates(language: Language): PackTemplate[] {
  const en = language === "en";
  const label = (english: string, chinese: string) => en ? english : chinese;
  const section = (english: string, chinese: string, content: string) => content.trim() ? "## " + label(english, chinese) + "\n\n" + content.trim() : "";
  return [
    {
      id: "none",
      title: label("Pack freely", "自由打包"),
      description: label("Write a focused brief from the selected material.", "根据已选素材编写一份聚焦的工作说明。"),
      fields: [],
      defaults: {},
      build: () => [label("Use the supplied files, links, and notes as context for the task below.", "请将本次提供的附件、链接和备注作为以下任务的上下文。"), label("Keep confirmed facts distinct from inspiration, constraints, and unknowns. Do not invent missing context.", "请区分确认事实、参考灵感、约束与未知项；不要补造缺失上下文。"), label("Task:", "任务：")],
    },
    {
      id: "continue-agent",
      title: "Continue with Agent",
      description: label("Hand the working context to the next agent without repeating background.", "把当前工作上下文交给下一个 Agent，无需重复解释背景。"),
      fields: [{ key: "additionalRequirements", label: label("Additional requirements", "其他要求"), placeholder: label("For example: Do not treat visual references as approved interface designs.", "例如：不要把视觉参考当作已确认的界面设计。"), type: "textarea" }],
      defaults: {},
      build: (values) => [
        label("I want to continue work from the supplied conversation, files, and links. Do not execute the work yet.", "请基于原对话以及本次提供的附件和链接继续协作；暂时不要直接执行工作。"),
        section("Context", "上下文", label("Use the original conversation and the supplied files and links as portable context. Treat user notes as the only explanation of an asset's role.", "请将原对话、附件和链接作为可移交的上下文；用户备注是素材用途的唯一说明。")),
        section("Additional requirements", "其他要求", values.additionalRequirements || ""),
        label("Before proposing work, inspect the available context. Identify the active task from the source material, state which materials you can actually use, separate confirmed facts from constraints and unknowns, then provide a prioritized next-step plan. Do not invent missing context or expand scope.", "请先说明你实际可以使用哪些原对话、附件和链接，并区分确认事实、约束与未知项。随后给出有优先级的下一步计划。不要补造缺失上下文，也不要擅自扩展范围。"),
      ],
    },
    {
      id: "build-app-site",
      title: "Build App / Site",
      description: label("Turn references, content, and constraints into a usable first version.", "把参考、素材和约束收敛为可使用的应用或网站第一版。"),
      fields: [
        { key: "mode", label: label("Mode", "执行方式"), placeholder: "", type: "select", options: [{ value: "prd", label: label("Create PRD first", "先生成 PRD") }, { value: "build", label: label("Start building", "直接开始构建") }] },
        { key: "product", label: label("Product and users", "产品与用户"), placeholder: label("For example: A local-first workspace for small creative teams to organize material before moving to another tool.", "例如：面向小型创意团队的本地优先工作台，用于整理素材并交接给下一个工具。"), type: "textarea" },
        { key: "scope", label: label("MVP scope and constraints", "MVP 范围与约束"), placeholder: label("For example: Cover collection, organization, and handoff. Desktop-first; avoid becoming a generic media library.", "例如：覆盖收集、整理和交接；桌面优先，不做通用多媒体库。"), type: "textarea" },
      ],
      defaults: { mode: "prd" },
      build: (values) => {
        const direct = values.mode === "build";
        return [
          direct ? label("Start building the first usable version of the app or site from the supplied material.", "请基于本次提供的素材，直接开始构建这个应用或网站的第一版。") : label("Create one comprehensive PRD before implementation.", "请先生成一份可审阅的 PRD，暂时不要开始实现。"),
          section("Product and users", "产品与用户", values.product || ""),
          section("MVP scope and constraints", "MVP 范围与约束", values.scope || ""),
          direct ? label("Read the supplied material first. Before implementation, state how confirmed references and constraints will be used. Build only the defined MVP scope. Do not turn unverified file or link content into product facts. End with what was built, what remains assumed, and what needs review.", "开始实现前，请简要说明将如何使用已确认的素材和约束。只构建 MVP 范围，不要把未验证的文件或链接内容当作产品事实。完成后说明已构建内容、仍属假设的内容和需要复核的部分。") : label("Use exactly four sections: Product and users; MVP scope and core flow; Design and content references; Implementation approach and acceptance boundaries. Separate confirmed input from minimal assumptions. Use declared assets only where their role is supported by the supplied material.", "PRD 必须使用四个章节：产品目标与用户、MVP 范围与核心流程、设计与内容参考、实现建议与验收边界。请区分确认输入和最小假设，并说明每项已声明素材如何影响 Brief。"),
        ];
      },
    },
    {
      id: "promo-video",
      title: "Generate Promo Video",
      description: label("Organize images, video, audio, and briefs into a producible promo video.", "把图片、视频、音频和 Brief 组织成可生产的宣传视频。"),
      fields: [
        { key: "mode", label: label("Mode", "执行方式"), placeholder: "", type: "select", options: [{ value: "plan", label: label("Create treatment and storyboard first", "先给创意方案与分镜") }, { value: "produce", label: label("Produce the promo video", "直接制作宣传片") }] },
        { key: "brief", label: label("Creative brief", "创意 Brief"), placeholder: label("For example: A calm 15-second launch film for creative professionals. Show confirmed product value; avoid unverified claims.", "例如：面向创意工作者的克制感 15 秒新品短片；只呈现已确认的产品价值。"), type: "textarea" },
        { key: "format", label: label("Duration and format", "时长和画幅"), placeholder: label("For example: 15 seconds, 9:16 vertical", "例如：15 秒，9:16 竖版") },
      ],
      defaults: { mode: "plan" },
      build: (values) => {
        const direct = values.mode === "produce";
        return [
          direct ? label("Produce a brand promo video within your available capabilities.", "请在你的能力范围内直接制作一支品牌宣传片。") : label("Create a reviewable creative treatment and storyboard before producing any video.", "请先产出可审阅的创意方案与分镜，暂时不要直接生成或制作视频。"),
          section("Creative brief", "创意 Brief", values.brief || ""),
          section("Duration and format", "规格", values.format || ""),
          direct ? label("First establish a concise brand or product brief from confirmed facts and declared assets. State how assets will be used before production, preserve their stated roles, and do not fabricate products, people, scenes, claims, or likenesses. Verify the final output against the requested message, duration, format, readability, and declared assets.", "只使用已确认事实和已声明资产。制作前先说明素材如何使用，保持其备注中的用途；不要虚构产品、人物、场景、主张或形象。交付前检查主信息、时长、画幅、可读性与已声明素材是否一致。") : label("Return: a concise brand or product brief; creative direction; asset-use plan; beat-by-beat storyboard with timing and frame intent; copy or voiceover; sound and subtitle guidance; and open questions. Do not fabricate anything not visible in the declared material.", "请依次输出：创意处理、素材使用计划、包含时间和画面意图的镜头节拍、文案或旁白、声音与字幕建议、待确认项。不要编造已声明素材中无法确认的内容。"),
        ];
      },
    },
    {
      id: "creative-direction-deck",
      title: "Make Creative Direction Deck",
      description: label("Turn references into one established direction for team or client alignment.", "把分散参考收敛为一个既定创意方向，帮助团队或客户对齐。"),
      fields: [
        { key: "mode", label: label("Mode", "执行方式"), placeholder: "", type: "select", options: [{ value: "direction", label: label("Create direction first", "先给创意方向") }, { value: "produce", label: label("Produce the deck", "直接制作 Deck") }] },
        { key: "decision", label: label("Audience and decision", "受众与决策"), placeholder: label("For example: For product and creative stakeholders: align on one direction that can move forward.", "例如：面向产品和创意决策者，对齐一个可继续推进的方向。"), type: "textarea" },
        { key: "narrative", label: label("Established direction and narrative", "既定方向与叙事"), placeholder: label("For example: A focused working environment, not a marketing landing page; show how material becomes ready for the next step.", "例如：呈现专注的工作环境而非营销落地页，展示素材如何为下一步工作做好准备。"), type: "textarea" },
      ],
      defaults: { mode: "direction" },
      build: (values) => {
        const direct = values.mode === "produce";
        return [
          direct ? label("Produce a creative direction deck from the supplied material.", "请基于本次提供的素材，直接制作一份创意方向 Deck。") : label("Turn the supplied material into a reviewable deck brief and outline before producing slides.", "请先产出可审阅的创意方向 Brief 与 Deck 大纲，暂时不要直接制作页面。"),
          section("Audience and decision", "受众与决策", values.decision || ""),
          section("Established direction and narrative", "既定方向与叙事", values.narrative || ""),
          direct ? label("Use the supplied material as the source of truth. Explain one established direction; do not introduce multiple competing directions. Use only declared assets and confirmed facts. Before delivery, check narrative flow, action-oriented slide titles, information density, and every asset reference.", "请讲清一个既定方向，不要引入多个互相竞争的方向。只使用已声明资产和确认事实。交付前检查叙事连贯性、行动式页面标题、信息密度和每项素材引用。") : label("Use one brief as the source of truth. Return one direction brief: core narrative, audience takeaway, slide-by-slide structure, action titles, key information, declared-asset usage, missing material, and questions requiring approval. This is not a moodboard or a comparison of alternatives.", "请输出一个方向 Brief：核心叙事、希望受众带走的信息、逐页结构、行动式标题、关键信息、已声明素材如何使用、缺失素材与待确认项。这不是素材拼贴，也不是多个方向的比较。"),
        ];
      },
    },
  ];
}

function kindLabel(modality: Modality, language: Language) { if (modality === "post") return language === "zh" ? "帖子" : "Post"; return interfaceCopy[language][modality === "conversation" ? "chat" : modality]; }
const kindIcon = { text: FileText, image: Image, video: Video, audio: Music2, file: FileText, link: Link2, post: MessageSquare, conversation: Workflow } satisfies Record<Modality, typeof FileText>;
const localImportExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".mov", ".webm", ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".rtf", ".json", ".html", ".htm"];
const localImportAccept = localImportExtensions.join(",");
// The published Picker is installed from the Chrome Web Store. This is the
// Store-signed build that the Desktop API explicitly recognizes.
const pickerInstallUrl = "https://chromewebstore.google.com/detail/picker-for-agent/pkglhngkfkjblabnhgcioindjgffgfpf?hl=en-US&utm_source=ext_sidebar";
const markdownSerializer = new TurndownService({ bulletListMarker: "-", codeBlockStyle: "fenced", linkStyle: "inlined" });
markdownSerializer.use(turndownTables);
function toggleFilterValue<T>(values: T[], value: T) { return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]; }

export default function SourcebookSources() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState("");
  const [unreadBookIds, setUnreadBookIds] = useState<string[]>([]);
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isCreateBookOpen, setIsCreateBookOpen] = useState(false);
  const [isCreateTextOpen, setIsCreateTextOpen] = useState(false);
  const [renameBookTarget, setRenameBookTarget] = useState<Book | null>(null);
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null);
  const [transferItem, setTransferItem] = useState<SourceItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedIdsByBook, setLastSelectedIdsByBook] = useState<Record<string, string[]>>({});
  const [isBatchSelecting, setIsBatchSelecting] = useState(false);
  const [density, setDensity] = useState<CardDensity>(() => (window.localStorage.getItem("sourcebook-card-density") as CardDensity) || "standard");
  const [query, setQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [kind, setKind] = useState<Modality[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const [linkFilter, setLinkFilter] = useState<Exclude<LinkFilter, "all">[]>([]);
  const [localFilter, setLocalFilter] = useState<Exclude<LocalFilter, "all">[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptSettingsOpen, setIsPromptSettingsOpen] = useState(false);
  const [isLibrarySettingsOpen, setIsLibrarySettingsOpen] = useState(false);
  const [isUpdateSettingsOpen, setIsUpdateSettingsOpen] = useState(false);
  const [isMCPSettingsOpen, setIsMCPSettingsOpen] = useState(false);
  const [isMCPSuggestionsOpen, setIsMCPSuggestionsOpen] = useState(false);
  const [librarySettings, setLibrarySettings] = useState<LibrarySettingsResponse | null>(null);
  const [updateSettings, setUpdateSettings] = useState<UpdateSettingsResponse | null>(null);
  const [mcpSettings, setMCPSettings] = useState<MCPSettingsResponse | null>(null);
  const [mcpSuggestions, setMCPSuggestions] = useState<MCPSuggestionEntry[]>([]);
  const [promptTemplate, setPromptTemplate] = useState("");
  const [isClearDataOpen, setIsClearDataOpen] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [language, setLanguage] = useState<"en" | "zh">(() => window.localStorage.getItem("sourcebook-language") === "zh" || (window.localStorage.getItem("sourcebook-language") === null && navigator.language.toLowerCase().startsWith("zh")) ? "zh" : "en");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isBackupExportOpen, setIsBackupExportOpen] = useState(false);
  const [backupBookIds, setBackupBookIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [detailItem, setDetailItem] = useState<SourceItem | null>(null);
  const [focusDetailNote, setFocusDetailNote] = useState(false);
  const [previewItem, setPreviewItem] = useState<SourceItem | null>(null);
  const [isPackOpen, setIsPackOpen] = useState(false);
  const [isBookTransferOpen, setIsBookTransferOpen] = useState(false);
  const [isTransferringSelected, setIsTransferringSelected] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBatchNoteOpen, setIsBatchNoteOpen] = useState(false);
  const [downloadConfirmItem, setDownloadConfirmItem] = useState<SourceItem | null>(null);
  const failurePreviewEnabled = new URLSearchParams(window.location.search).has("previewFailures");
  const downloadStartTimesRef = useRef(new Map<string, number>());
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const localImportInputRef = useRef<HTMLInputElement | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);
  const knownPendingSuggestionIdsRef = useRef<Set<string> | null>(null);
  const packRef = useRef<HTMLDivElement | null>(null);
  const bookTransferRef = useRef<HTMLDivElement | null>(null);
  const requestedBookIdRef = useRef(new URLSearchParams(window.location.search).get("bookId"));
  const copy = interfaceCopy[language];

  function showSourcesMessage(nextMessage: string, duration = 3600, tone: "neutral" | "success" | "error" = "neutral") {
    if (messageTimeoutRef.current) window.clearTimeout(messageTimeoutRef.current);
    setMessageTone(tone);
    setMessage(nextMessage);
    messageTimeoutRef.current = duration ? window.setTimeout(() => setMessage(null), duration) : null;
  }

  async function refreshMCPSuggestions({ openOnNew = false }: { openOnNew?: boolean } = {}) {
    try {
      const response = await request<MCPSuggestionsResponse>("/api/mcp/suggestions");
      const suggestions = response.suggestions || [];
      const pendingIds = new Set(suggestions.filter((entry) => entry.suggestion.status === "pending").map((entry) => entry.suggestion.id));
      const knownIds = knownPendingSuggestionIdsRef.current;
      const hasNewSuggestion = Boolean(openOnNew && knownIds && [...pendingIds].some((id) => !knownIds.has(id)));
      knownPendingSuggestionIdsRef.current = pendingIds;
      setMCPSuggestions(suggestions);
      if (hasNewSuggestion) setIsMCPSuggestionsOpen(true);
    } catch {
      // Suggestions are an enhancement to an already usable local library.
    }
  }

  async function loadItems({ announce = false, background = false, bookId = activeBookId, limit = sourcePageSize }: { announce?: boolean; background?: boolean; bookId?: string; limit?: number } = {}) {
    const requestStartedAt = Date.now();
    if (announce) { setIsRefreshing(true); showSourcesMessage("Refreshing sources…", 0); }
    else if (!background) setLoading(true);
    try {
      const response = await request<SourcePage>(bookPath(`/api/sources?limit=${limit}`, bookId));
      const nextItems = failurePreviewEnabled ? [...failurePreviewItems(bookId), ...response.items] : response.items;
      setItems((current) => nextItems.map((item) => {
        const downloadStartedAt = downloadStartTimesRef.current.get(item.id);
        if (downloadStartedAt && requestStartedAt < downloadStartedAt) {
          const currentItem = current.find((entry) => entry.id === item.id);
          return currentItem?.assetCacheState === "downloading" ? { ...item, assetCacheState: "downloading" } : item;
        }
        if (downloadStartedAt) downloadStartTimesRef.current.delete(item.id);
        return item;
      }));
      setTotalItems(response.total + (failurePreviewEnabled ? 3 : 0));
      setNextCursor(response.nextCursor);
      setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
      if (announce) showSourcesMessage(`Refreshed ${response.total} source${response.total === 1 ? "" : "s"}.`, 3600, "success");
      else setMessage(null);
    } catch (error) { showSourcesMessage(announce ? `Could not refresh sources: ${errorMessage(error)}` : errorMessage(error), announce ? 6000 : 3600, "error"); }
    finally { if (announce) setIsRefreshing(false); else if (!background) setLoading(false); }
  }
  async function loadMoreItems() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await request<SourcePage>(bookPath(`/api/sources?limit=${sourcePageSize}&cursor=${encodeURIComponent(nextCursor)}`, activeBookId));
      setItems((current) => [...current, ...response.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotalItems(response.total);
      setNextCursor(response.nextCursor);
    } catch (error) { showSourcesMessage(errorMessage(error), 3600, "error"); }
    finally { setIsLoadingMore(false); }
  }
  async function loadBooks() {
    let response = await request<BookManifest>("/api/books");
    const requestedBookId = requestedBookIdRef.current;
    const targetBookId = requestedBookId && response.books.some((book) => book.id === requestedBookId) ? requestedBookId : response.activeBookId;
    if (targetBookId !== response.activeBookId) response = await request<BookManifest>(`/api/books/${encodeURIComponent(targetBookId)}/activate`, { method: "POST" });
    requestedBookIdRef.current = null;
    if (requestedBookId) window.history.replaceState({}, "", window.location.pathname);
    setBooks(response.books); setUnreadBookIds(response.unreadBookIds || []); setActiveBookId(response.activeBookId);
  }
  useEffect(() => { void loadBooks(); }, []);
  useEffect(() => { window.localStorage.setItem("sourcebook-card-density", density); }, [density]);
  useEffect(() => {
    void request<PromptSettingsResponse>("/api/settings/prompt")
      .then((response) => setPromptTemplate(response.template || ""))
      .catch((error) => setMessage(errorMessage(error)));
  }, []);
  useEffect(() => {
    void request<LibrarySettingsResponse>("/api/settings/library").then((response) => {
      setLibrarySettings(response);
      if (response.requiresSetup) setIsLibrarySettingsOpen(true);
    }).catch((error) => setMessage(errorMessage(error)));
    void request<UpdateSettingsResponse>("/api/settings/update").then(setUpdateSettings).catch(() => undefined);
    void request<MCPSettingsResponse>("/api/settings/mcp").then(setMCPSettings).catch(() => undefined);
    void refreshMCPSuggestions();
  }, []);
  useEffect(() => {
    // Agent proposals can target a Book other than the one currently open in
    // Sources, so the active-Book event stream alone cannot reliably surface
    // them. Poll only while the window is visible; this keeps the review queue
    // responsive without turning it into a persistent background task.
    const refreshSuggestions = () => {
      if (!document.hidden) void refreshMCPSuggestions({ openOnNew: true });
    };
    const timer = window.setInterval(refreshSuggestions, 3000);
    document.addEventListener("visibilitychange", refreshSuggestions);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshSuggestions);
    };
  }, []);
  useEffect(() => { if (activeBookId) void loadItems(); }, [activeBookId]);
  useEffect(() => { if (activeBookId && (query.trim() || kind.length || source.length || linkFilter.length || localFilter.length || dateFilter !== "all" || onlyFavorites)) void loadItems({ limit: bookSourceLimit }); }, [activeBookId, dateEnd, dateFilter, dateStart, kind, linkFilter, localFilter, onlyFavorites, query, source]);
  useEffect(() => { if (!items.some((item) => item.assetCacheState === "downloading")) return; const timer = window.setInterval(() => void loadItems({ background: true }), 1500); return () => window.clearInterval(timer); }, [activeBookId, items]);
  useEffect(() => {
    if (!activeBookId) return;
    let refreshTimer: number | undefined;
    const refresh = () => void loadItems({ background: true, bookId: activeBookId });
    const queueRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, 180);
      void refreshMCPSuggestions({ openOnNew: true });
    };
    const stream = new EventSource(`/api/events?bookId=${encodeURIComponent(activeBookId)}`);
    stream.addEventListener("sources", queueRefresh);
    const refreshWhenVisible = () => { if (!document.hidden) { refresh(); void loadBooks(); } };
    const refreshWhenFocused = () => { refresh(); void loadBooks(); };
    window.addEventListener("focus", refreshWhenFocused);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(refreshTimer);
      stream.close();
      window.removeEventListener("focus", refreshWhenFocused);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [activeBookId]);
  useEffect(() => () => { if (messageTimeoutRef.current) window.clearTimeout(messageTimeoutRef.current); }, []);
  useEffect(() => {
    const closeIfOutside = (event: MouseEvent) => { if (!settingsRef.current?.contains(event.target as Node)) setIsSettingsOpen(false); if (!filterRef.current?.contains(event.target as Node)) setIsFiltersOpen(false); if (!bookRef.current?.contains(event.target as Node)) setIsBookOpen(false); if (!packRef.current?.contains(event.target as Node)) setIsPackOpen(false); if (!bookTransferRef.current?.contains(event.target as Node)) setIsBookTransferOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setIsSettingsOpen(false); setIsFiltersOpen(false); setIsBookOpen(false); setIsPackOpen(false); setIsBookTransferOpen(false); } };
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeIfOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; window.localStorage.setItem("sourcebook-language", language); }, [language]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const post = item.metadata.post;
    const matchesQuery = !normalizedQuery || [item.itemTitle, item.sourceTitle, item.sourceOrigin, item.sourceUrl, item.contentUrl, item.userNote, item.contentText, item.resourceSummary, item.metadata.description, item.metadata.pageTitle, item.metadata.ogTitle, item.metadata.siteName, item.metadata.canonicalUrl, item.metadata.conversation?.provider, post?.title, post?.bodyText, post?.author?.displayName, post?.author?.handle, ...(post?.tags ?? [])].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    return matchesQuery && matchesDate(item.pickedAt, dateFilter, dateStart, dateEnd) && (!kind.length || kind.includes(item.modality)) && (!source.length || source.includes(sourceLabel(item))) && (!linkFilter.length || linkFilter.includes(item.linkState as Exclude<LinkFilter, "all">)) && (!localFilter.length || localFilter.includes(localState(item) as Exclude<LocalFilter, "all">)) && (!onlyFavorites || item.favorite);
  }), [dateEnd, dateFilter, items, kind, linkFilter, localFilter, onlyFavorites, query, source]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const reusableSelectionIds = useMemo(() => (lastSelectedIdsByBook[activeBookId] || []).filter((id) => items.some((item) => item.id === id)), [activeBookId, items, lastSelectedIdsByBook]);
  const hasReusableSelection = reusableSelectionIds.length > 0;
  const sourceOptions = useMemo(() => [...new Set(items.map(sourceLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const selectVisibleItems = () => setSelectedIds(visibleItems.map((item) => item.id));
  const rememberSelection = (bookId: string, ids: string[]) => {
    if (!bookId || !ids.length) return;
    setLastSelectedIdsByBook((current) => ({ ...current, [bookId]: [...new Set(ids)] }));
  };
  const removeFromReusableSelection = (bookId: string, ids: string[]) => {
    if (!ids.length) return;
    const removed = new Set(ids);
    setLastSelectedIdsByBook((current) => {
      const previous = current[bookId];
      if (!previous) return current;
      const next = previous.filter((id) => !removed.has(id));
      if (next.length === previous.length) return current;
      const updated = { ...current };
      if (next.length) updated[bookId] = next;
      else delete updated[bookId];
      return updated;
    });
  };
  const resetSourceFilters = () => {
    setQuery(""); setKind([]); setSource([]); setLinkFilter([]); setLocalFilter([]); setDateFilter("all"); setDateStart(""); setDateEnd(""); setOnlyFavorites(false); setIsFiltersOpen(false);
  };
  const restoreLastSelection = () => {
    const previous = lastSelectedIdsByBook[activeBookId] || [];
    const available = previous.filter((id) => items.some((item) => item.id === id));
    if (!available.length) {
      removeFromReusableSelection(activeBookId, previous);
      showSourcesMessage(language === "zh" ? "上一次选择中的素材已不存在。" : "The sources from the previous selection are no longer available.", 3600, "error");
      return;
    }
    resetSourceFilters();
    setSelectedIds(available);
    if (available.length !== previous.length) removeFromReusableSelection(activeBookId, previous.filter((id) => !available.includes(id)));
    const skipped = previous.length - available.length;
    showSourcesMessage(language === "zh" ? `已恢复 ${available.length} 个上一次选择的素材${skipped ? `，跳过 ${skipped} 个已不存在的素材。` : "。"}` : `Restored ${available.length} source${available.length === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} unavailable source${skipped === 1 ? "" : "s"}.` : "."}`, 3600, "success");
  };
  const exitBatchSelection = () => { rememberSelection(activeBookId, selectedIds); setSelectedIds([]); setIsBatchSelecting(false); setIsPackOpen(false); setIsBookTransferOpen(false); };
  async function copySource(item: SourceItem) {
    try {
      if (hasCopyablePackFile(item)) {
        const result = await request<{ copied: number }>(bookPath("/api/source-packs/copy-materials", item.bookId), { method: "POST", body: JSON.stringify({ sourceItemIds: [item.id] }) });
        showSourcesMessage(language === "zh" ? `已复制 ${result.copied} 个文件，可粘贴到 Agent 对话框。` : `Copied ${result.copied} file${result.copied === 1 ? "" : "s"}. Paste them into your agent chat.`, 3600, "success");
        return;
      }
      const link = webLinkFor(item);
      if (!link) throw new Error(language === "zh" ? "此素材没有可复制的文件或链接。" : "This source has no copyable file or link.");
      await navigator.clipboard.writeText(link);
      showSourcesMessage(language === "zh" ? "链接已复制。" : "Link copied.", 3600, "success");
    } catch (error) {
      showSourcesMessage(`Could not copy this source: ${errorMessage(error)}`, 6000, "error");
    }
  }
  async function copyPackedMaterials() {
    try {
      const result = await request<{ copied: number; skipped: number; linkReferences: number }>(bookPath("/api/source-packs/copy-materials", activeBookId), { method: "POST", body: JSON.stringify({ sourceItemIds: selectedIds }) });
      const detail = result.skipped ? (language === "zh" ? `${result.skipped} 个没有本地文件的素材会在复制提示词时以链接提供。` : `${result.skipped} source${result.skipped === 1 ? "" : "s"} without a local file will be included as links when you copy the prompt.`) : "";
      showSourcesMessage(language === "zh" ? `已复制 ${result.copied} 个文件，可粘贴到 Agent 对话框。${detail}` : `Copied ${result.copied} file${result.copied === 1 ? "" : "s"}. Paste them into your agent chat.${detail ? " " + detail : ""}`, 3600, "success");
      return true;
    } catch (error) {
      showSourcesMessage(language === "zh" ? `无法复制素材：${errorMessage(error)}` : `Could not copy sources: ${errorMessage(error)}`, 6000, "error");
      return false;
    }
  }
  async function copyPackPrompt() {
    try {
      const activeBookName = books.find((book) => book.id === activeBookId)?.name || "Default Book";
      await navigator.clipboard.writeText(renderPromptTemplate(promptTemplate || defaultPromptTemplate(language), selectedItems, language, activeBookName));
      showSourcesMessage(language === "zh" ? "提示词已复制，可粘贴到 Agent 对话框。" : "Prompt copied. Paste it into your agent chat.", 3600, "success");
    } catch (error) {
      showSourcesMessage(language === "zh" ? `无法复制提示词：${errorMessage(error)}` : `Could not copy prompt: ${errorMessage(error)}`, 6000, "error");
    }
  }
  async function savePromptTemplate(template: string) {
    try {
      const value = template.trim() === defaultPromptTemplate(language).trim() ? "" : template.trim();
      const response = await request<PromptSettingsResponse>("/api/settings/prompt", { method: "PUT", body: JSON.stringify({ template: value }) });
      setPromptTemplate(response.template || "");
      setIsPromptSettingsOpen(false);
      showSourcesMessage(language === "zh" ? "提示词设置已保存。" : "Prompt settings saved.", 3600, "success");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function removeSelected() {
    if (!selectedIds.length) return;
    try {
      const deletedIds = [...selectedIds];
      await request(bookPath("/api/sources", activeBookId), { method: "DELETE", body: JSON.stringify({ sourceItemIds: deletedIds }) });
      removeFromReusableSelection(activeBookId, deletedIds);
      setIsDeleteOpen(false); setDetailItem(null); await loadItems();
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function toggleFavorite(id: string, favorite: boolean) {
    try {
      await request(bookPath(`/api/sources/${id}/favorite`, activeBookId), { method: "PATCH", body: JSON.stringify({ favorite }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, favorite } : item));
      setDetailItem((current) => current?.id === id ? { ...current, favorite } : current);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function saveNote(id: string, note: string) {
    try {
      await request(bookPath(`/api/sources/${id}/note`, activeBookId), { method: "PATCH", body: JSON.stringify({ note }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, userNote: note } : item));
      setDetailItem((current) => current?.id === id ? { ...current, userNote: note } : current);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function saveTitle(id: string, title: string) {
    try {
      const response = await request<{ title: string }>(bookPath(`/api/sources/${id}/title`, activeBookId), { method: "PATCH", body: JSON.stringify({ title }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, itemTitle: response.title } : item));
      setDetailItem((current) => current?.id === id ? { ...current, itemTitle: response.title } : current);
      return true;
    } catch (error) { setMessage(errorMessage(error)); return false; }
  }
  async function saveContent(id: string, contentText: string) {
    try {
      const response = await request<{ contentText: string }>(bookPath(`/api/sources/${id}/content`, activeBookId), { method: "PATCH", body: JSON.stringify({ contentText }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, contentText: response.contentText } : item));
      setDetailItem((current) => current?.id === id ? { ...current, contentText: response.contentText } : current);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function removeItem(id: string) {
    try {
      await request(bookPath("/api/sources", activeBookId), { method: "DELETE", body: JSON.stringify({ sourceItemIds: [id] }) });
      removeFromReusableSelection(activeBookId, [id]);
      setDetailItem(null); setPreviewItem(null); await loadItems();
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function startDownload(item: SourceItem) {
    setDownloadConfirmItem(null);
    downloadStartTimesRef.current.set(item.id, Date.now());
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, assetCacheState: "downloading" } : entry));
    setDetailItem((current) => current?.id === item.id ? { ...current, assetCacheState: "downloading" } : current);
    try { await request<{ status: "downloading" }>(bookPath(`/api/sources/${item.id}/download`, activeBookId), { method: "POST" }); showSourcesMessage("Downloading image…", 0); }
    catch (error) { downloadStartTimesRef.current.delete(item.id); setMessage(errorMessage(error)); await loadItems({ background: true }); }
  }
  async function revealLocalFile(item: SourceItem) {
    try {
      await request(bookPath(`/api/sources/${item.id}/reveal-local`, activeBookId), { method: "POST" });
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function openLocalFile(item: SourceItem) {
    try {
      await request(bookPath(`/api/sources/${item.id}/open-local`, activeBookId), { method: "POST" });
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function appendBatchNote(note: string) {
    const addition = note.trim();
    if (!addition || !selectedItems.length) return;
    try {
      const updates = selectedItems.map((item) => ({ id: item.id, note: item.userNote.trim() ? `${item.userNote.trim()}${addition}` : addition }));
      await Promise.all(updates.map((update) => request(bookPath(`/api/sources/${update.id}/note`, activeBookId), { method: "PATCH", body: JSON.stringify({ note: update.note }) })));
      setItems((current) => current.map((item) => updates.find((update) => update.id === item.id) ? { ...item, userNote: updates.find((update) => update.id === item.id)!.note } : item));
      setIsBatchNoteOpen(false);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function selectBook(bookId: string) {
    try {
      const response = await request<BookManifest>(`/api/books/${encodeURIComponent(bookId)}/activate`, { method: "POST" });
      if (isBatchSelecting) rememberSelection(activeBookId, selectedIds);
      setBooks(response.books); setUnreadBookIds(response.unreadBookIds || []); setActiveBookId(response.activeBookId); setSelectedIds([]); setIsBatchSelecting(false); setIsPackOpen(false); setIsBookTransferOpen(false); setDetailItem(null); setIsBookOpen(false);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function createBook(name: string) {
    try {
      const response = await request<{ book: Book }>("/api/books", { method: "POST", body: JSON.stringify({ name }) });
      await loadBooks(); await selectBook(response.book.id); setIsCreateBookOpen(false);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function createTextSource(title: string, contentText: string) {
    const content = contentText.trim();
    if (!content) return;
    try {
      await request(bookPath("/api/sources", activeBookId), {
        method: "POST",
        body: JSON.stringify({
          modality: "text",
          pickType: "manual_text",
          title: title.trim() || "记录",
          contentText: content,
          sourceLabel: language === "zh" ? "手动文本" : "Manual text",
          sourceTitle: language === "zh" ? "手动文本" : "Manual text",
        }),
      });
      setIsCreateTextOpen(false);
      await loadItems({ background: true });
      showSourcesMessage(language === "zh" ? "文本已创建。" : "Text created.", 3600, "success");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function renameBook(bookId: string, name: string) {
    try {
      const response = await request<{ book: Book }>(`/api/books/${encodeURIComponent(bookId)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setBooks((current) => current.map((book) => book.id === response.book.id ? response.book : book));
      setRenameBookTarget(null);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function removeBook(bookId: string) {
    try {
      const response = await request<BookManifest>(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
      setLastSelectedIdsByBook((current) => { const next = { ...current }; delete next[bookId]; return next; });
      setBooks(response.books); setUnreadBookIds(response.unreadBookIds || []); setActiveBookId(response.activeBookId); setSelectedIds([]); setIsBatchSelecting(false); setDetailItem(null); setDeleteBookTarget(null);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function transferSource(targetBookId: string, mode: "copy" | "move") {
    if (!transferItem) return;
    try {
      await request(`/api/books/${encodeURIComponent(activeBookId)}/sources/${encodeURIComponent(transferItem.id)}/transfer`, { method: "POST", body: JSON.stringify({ targetBookId, mode }) });
      setTransferItem(null); setDetailItem(null); await loadItems(); showSourcesMessage(mode === "move" ? "Source moved to the selected Book." : "Source copied to the selected Book.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function transferSelectedSources(targetBookId: string, mode: "copy" | "move") {
    const sourceItemIds = [...selectedIds];
    if (!sourceItemIds.length || isTransferringSelected) return;
    setIsTransferringSelected(true);
    try {
      for (const sourceItemId of sourceItemIds) {
        await request(`/api/books/${encodeURIComponent(activeBookId)}/sources/${encodeURIComponent(sourceItemId)}/transfer`, { method: "POST", body: JSON.stringify({ targetBookId, mode }) });
      }
      setIsBookTransferOpen(false);
      setSelectedIds([]);
      if (mode === "copy") rememberSelection(activeBookId, sourceItemIds);
      else removeFromReusableSelection(activeBookId, sourceItemIds);
      await loadItems({ background: true });
      const count = sourceItemIds.length;
      showSourcesMessage(language === "zh" ? `已${mode === "move" ? "移动" : "复制"} ${count} 个素材到目标 Book。` : `${mode === "move" ? "Moved" : "Copied"} ${count} source${count === 1 ? "" : "s"} to the selected Book.`, 3600, "success");
    } catch (error) {
      await loadItems({ background: true });
      showSourcesMessage(language === "zh" ? `转移未完成：${errorMessage(error)}` : `Transfer did not complete: ${errorMessage(error)}`, 6000, "error");
    } finally {
      setIsTransferringSelected(false);
    }
  }
  function openBackupExport() {
    setBackupBookIds(books.map((book) => book.id));
    setIsSettingsOpen(false);
    setIsBackupExportOpen(true);
  }
  async function exportBackup(bookIds: string[]) {
    try {
      if (!bookIds.length) return;
      const parameters = new URLSearchParams();
      bookIds.forEach((bookId) => parameters.append("bookId", bookId));
      const link = document.createElement("a");
      link.href = `/api/library/backup?${parameters.toString()}`;
      link.download = `sourcebook-${new Date().toISOString().slice(0, 10)}.sourcebook-backup`;
      link.click();
      setIsBackupExportOpen(false);
      showSourcesMessage("Backup downloaded.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function importBackup(file: File) {
    let mode: "append" | "replace" = "append";
    const addAsNewBooks = window.confirm("Add this backup as new Books? Choose Cancel to keep your current library unchanged or review the replacement option.");
    if (!addAsNewBooks) {
      const replaceLibrary = window.confirm("Replace the entire library with this backup? Your current Books and local files will be moved aside for recovery. Choose Cancel to leave everything unchanged.");
      if (!replaceLibrary) return;
      mode = "replace";
    }
    try {
      const restored = await requestBackupRestore(file, mode);
      const firstImportedBookId = restored.imported?.[0]?.id || restored.activeBookId;
      const manifest = await request<BookManifest>(`/api/books/${encodeURIComponent(firstImportedBookId)}/activate`, { method: "POST" });
      setBooks(manifest.books); setUnreadBookIds(manifest.unreadBookIds || []); setActiveBookId(manifest.activeBookId);
      setItems([]); setSelectedIds([]); setLastSelectedIdsByBook({}); setDetailItem(null); setPreviewItem(null);
      await loadItems({ bookId: firstImportedBookId });
      showSourcesMessage(mode === "replace" ? "Library restored from backup." : "Backup imported as new Books.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function clearLocalData() {
    setIsClearingData(true);
    try {
      const response = await request<BookManifest>("/api/library", { method: "DELETE" });
      setBooks(response.books);
      setUnreadBookIds(response.unreadBookIds || []);
      setActiveBookId(response.activeBookId);
      setItems([]); setSelectedIds([]); setLastSelectedIdsByBook({}); setIsBatchSelecting(false); setDetailItem(null); setPreviewItem(null); setIsClearDataOpen(false);
      await loadItems({ bookId: response.activeBookId });
      showSourcesMessage(language === "zh" ? "本地数据已清空。" : "Local data cleared.", 3600, "success");
    } catch (error) { showSourcesMessage(errorMessage(error), 6000, "error"); }
    finally { setIsClearingData(false); }
  }
  async function importLocalFiles(files: File[]) {
    if (!files.length || isImporting) return;
    setIsImporting(true);
    const failures: string[] = [];
    let succeeded = 0;
    try {
      for (const [index, file] of files.entries()) {
        showSourcesMessage(`Uploading ${index + 1} of ${files.length}…`, 0);
        try {
          const contentBase64 = await fileToBase64(file);
          await request(`/api/books/${encodeURIComponent(activeBookId)}/import`, { method: "POST", body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", contentBase64 }) });
          succeeded += 1;
        } catch (error) { failures.push(`${file.name}: ${errorMessage(error)}`); }
      }
      await loadItems({ background: true });
      const failureSummary = failures.length ? ` Failed ${failures.length}: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? `; +${failures.length - 3} more.` : ""}` : "";
      showSourcesMessage(`Uploaded ${succeeded} file${succeeded === 1 ? "" : "s"}.${failureSummary}`, failures.length ? 9000 : 3600);
    } finally { setIsImporting(false); }
  }
  const openPickerInstall = () => window.open(pickerInstallUrl, "_blank", "noopener,noreferrer");
  const emptySourceDescription = language === "zh"
    ? <>使用 <button className="empty-action-link" onClick={openPickerInstall} type="button">Picker插件</button> 获取网页内容 或 <button className="empty-action-link" onClick={() => localImportInputRef.current?.click()} type="button">{copy.importLocalFiles}</button></>
    : <>Use the <button className="empty-action-link" onClick={openPickerInstall} type="button">Picker extension</button> to collect web content or <button className="empty-action-link" onClick={() => localImportInputRef.current?.click()} type="button">{copy.importLocalFiles}</button>.</>;

  const hasUnreadBooks = unreadBookIds.some((bookId) => bookId !== activeBookId && books.some((book) => book.id === bookId));

  return <LanguageContext.Provider value={language}><main className="app-shell public-sources-shell">
    <section className="sources-page sources-surface public-sources-surface" aria-label="Sources">
      <header className="panel-head">
        <div className="panel-title-block">
          <div className="book-title-row">
            <SourcebookLockup />
            <div className="book-switcher" ref={bookRef}>
              <button aria-expanded={isBookOpen} aria-haspopup="menu" aria-label={copy.switchBook} className={`book-switcher-button ${isBookOpen ? "is-open" : ""}`} onClick={() => { void loadBooks(); setIsBookOpen((open) => !open); }} type="button">
                <span className="book-switcher-label">{books.find((book) => book.id === activeBookId)?.name || "Default Book"}</span>
                {hasUnreadBooks ? <span aria-label="New Books available" className="book-unread-dot" role="status" /> : null}
                <span className="book-switcher-count">{books.length} Books</span>
                <ChevronDown aria-hidden="true" className="book-switcher-chevron" size={14} />
              </button>
              {isBookOpen ? <div className="book-switcher-menu" role="menu">
                {books.map((book) => <div className="book-menu-item" key={book.id}>
                  <button aria-label={`Book actions for ${book.name}`} className="book-options-button" data-tooltip={copy.setting} onClick={() => { setIsBookOpen(false); setRenameBookTarget(book); }} type="button"><EllipsisVertical size={14} /></button>
                  <button aria-pressed={book.id === activeBookId} className="book-menu-select" onClick={() => void selectBook(book.id)} role="menuitem" type="button"><span className="book-menu-label"><span>{book.name}</span>{unreadBookIds.includes(book.id) ? <span aria-label="New Book" className="book-unread-dot" role="status" /> : null}</span>{book.id === activeBookId ? <Check size={14} /> : null}</button>
                </div>)}
                <button className="book-new-button" onClick={() => { setIsBookOpen(false); setIsCreateBookOpen(true); }} type="button"><Plus size={14} />{copy.newBook}</button>
              </div> : null}
            </div>
            <div className="book-actions">
              <button aria-label={language === "zh" ? "Agent 提交" : "Agent submissions"} className="secondary-button header-action-button agent-suggestions-button" data-tooltip={language === "zh" ? "Agent 提交" : "Agent submissions"} onClick={() => setIsMCPSuggestionsOpen(true)} type="button"><ListChecks size={16} /><span className="header-action-label">{language === "zh" ? "Agent 提交" : "Agent submissions"}</span>{mcpSuggestions.some((entry) => entry.suggestion.status === "pending") ? <span aria-label={language === "zh" ? "有待处理的提交" : "Pending submissions"} className="agent-suggestions-dot" role="status" /> : null}</button>
              <button aria-label={copy.addText} className="secondary-button header-action-button local-import-button" data-tooltip={copy.addText} onClick={() => setIsCreateTextOpen(true)} title={copy.addText} type="button"><FilePlus2 size={16} /><span className="header-action-label">{copy.addText}</span></button>
              <button aria-label={copy.importLocalFiles} className="secondary-button header-action-button local-import-button" data-tooltip={copy.importLocalFiles} onClick={() => localImportInputRef.current?.click()} title={copy.importLocalFiles} type="button"><FileUp size={16} /><span className="header-action-label">{copy.importLocalFiles}</span></button>
              <div className="settings-menu" ref={settingsRef}>
                <button aria-label={updateSettings?.status === "available" ? `${copy.settings} — ${language === "zh" ? "有更新" : "Update available"}` : copy.settings} aria-expanded={isSettingsOpen} className="icon-button settings-trigger" data-tooltip={copy.settings} onClick={() => setIsSettingsOpen((open) => !open)} title={copy.settings} type="button"><Settings size={16} />{updateSettings?.status === "available" ? <span aria-hidden="true" className="settings-update-dot" /> : null}</button>
                {isSettingsOpen ? <div className="settings-popover" role="menu">
                  <button className="settings-picker-install" onClick={() => { openPickerInstall(); setIsSettingsOpen(false); }} role="menuitem" type="button"><Puzzle size={15} /><span>{copy.installPicker}</span></button>
                  <button onClick={() => { setIsSettingsOpen(false); setIsMCPSettingsOpen(true); }} role="menuitem" type="button"><Workflow size={15} /><span>{language === "zh" ? "连接 Agent" : "Connect an Agent"}</span></button>
                  <button onClick={() => { setIsSettingsOpen(false); setIsPromptSettingsOpen(true); }} role="menuitem" type="button"><Sparkles size={15} /><span>{copy.promptSettings}</span></button>
                  <button onClick={() => { setIsSettingsOpen(false); setIsLibrarySettingsOpen(true); }} role="menuitem" type="button"><HardDrive size={15} /><span>{language === "zh" ? "管理本地数据" : "Manage local data"}</span></button>
                  <button aria-label={updateSettings?.status === "available" ? `${language === "zh" ? "版本与更新" : "Version & updates"} — ${language === "zh" ? "有更新" : "Update available"}` : undefined} className={updateSettings?.status === "available" ? "settings-update-available" : ""} onClick={() => { setIsSettingsOpen(false); setIsUpdateSettingsOpen(true); }} role="menuitem" type="button"><RefreshCw size={15} /><span>{language === "zh" ? "版本与更新" : "Version & updates"}</span>{updateSettings?.status === "available" ? <span aria-hidden="true" className="settings-update-menu-dot" /> : null}</button>
                  <button onClick={() => { window.open("https://sourcebook.online", "_blank", "noopener,noreferrer"); setIsSettingsOpen(false); }} role="menuitem" type="button"><CircleHelp size={15} /><span>{copy.help}</span></button>
                  <button onClick={() => { window.open("https://sourcebook.online/feedback/", "_blank", "noopener,noreferrer"); setIsSettingsOpen(false); }} role="menuitem" type="button"><MessageSquare size={15} /><span>{copy.feedback}</span></button>
                  <button onClick={() => { setLanguage(language === "en" ? "zh" : "en"); setIsSettingsOpen(false); }} role="menuitem" type="button"><Languages size={15} /><span>{copy.switchLanguage}</span></button>
                </div> : null}
              </div>
              <button aria-label={copy.refresh} className="icon-button" data-tooltip={copy.refresh} onClick={() => void loadItems({ announce: true })} title={copy.refresh} type="button" disabled={loading || isRefreshing}><RefreshCw className={isRefreshing ? "spin" : undefined} size={16} /></button>
            </div>
          </div>
        </div>
      </header>
      <div className="sources-toolbar">
        <div className="drawer-search-tools">
          <span className="sources-filter-count">{copy.showing}: {visibleItems.length} / {totalItems}</span>
          <label className={`search-box sources-search source-item-search ${query || isSearchFocused ? "is-active" : ""}`}><Search size={15} strokeWidth={1.8} /><input placeholder={copy.search} value={query} onBlur={() => setIsSearchFocused(false)} onChange={(event) => setQuery(event.target.value)} onFocus={() => setIsSearchFocused(true)} />{query ? <button aria-label={copy.clearSearch} className="search-clear-button" data-tooltip={copy.clearSearch} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery("")} title={copy.clearSearch} type="button"><X size={13} /></button> : null}</label>
          <div className="filter-menu" ref={filterRef}><button aria-label={copy.filter} className="filter-menu-button icon-only" aria-expanded={isFiltersOpen} aria-pressed={Boolean(kind.length || source.length || linkFilter.length || localFilter.length || dateFilter !== "all")} data-tooltip={copy.filter} onClick={() => setIsFiltersOpen((open) => !open)} title={copy.filter} type="button"><Funnel size={15} /></button>{isFiltersOpen ? <FilterPopover copy={copy} dateEnd={dateEnd} dateFilter={dateFilter} dateStart={dateStart} kind={kind} linkFilter={linkFilter} localFilter={localFilter} source={source} sourceOptions={sourceOptions} onDateEndChange={setDateEnd} onDateFilterChange={(value) => setDateFilter((current) => current === value ? "all" : value)} onDateStartChange={setDateStart} onKindChange={(value) => setKind((current) => toggleFilterValue(current, value))} onLinkFilterChange={(value) => setLinkFilter((current) => toggleFilterValue(current, value))} onLocalFilterChange={(value) => setLocalFilter((current) => toggleFilterValue(current, value))} onReset={() => { setKind([]); setSource([]); setLinkFilter([]); setLocalFilter([]); setDateFilter("all"); setDateStart(""); setDateEnd(""); }} onSourceChange={(value) => setSource((current) => toggleFilterValue(current, value))} /> : null}</div>
          <button aria-label={copy.favorites} className="favorite-filter-button icon-only" aria-pressed={onlyFavorites} data-tooltip={copy.favorites} onClick={() => setOnlyFavorites((active) => !active)} title={copy.favorites} type="button"><Star size={15} fill={onlyFavorites ? "currentColor" : "none"} /></button>
          <div aria-label={language === "zh" ? "卡片密度" : "Card density"} className="density-control" role="group">
            {(["compact", "standard", "spacious"] as CardDensity[]).map((entry) => <button aria-label={entry} aria-pressed={density === entry} className={`density-button is-${entry}`} key={entry} onClick={() => setDensity(entry)} type="button"><span /></button>)}
          </div>
          <input accept={localImportAccept} className="visually-hidden" multiple onChange={(event) => { if (event.target.files?.length) void importLocalFiles(Array.from(event.target.files)); event.currentTarget.value = ""; }} ref={localImportInputRef} type="file" /><input accept=".sourcebook-backup" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ""; }} ref={backupInputRef} type="file" />
        </div>
      </div>
      {loading ? <EmptyState icon={<LoaderCircle className="spin" size={22} />} title={copy.loadingSources} description={copy.readingSources} /> : null}
      {!loading && visibleItems.length === 0 ? <EmptyState icon={<Package size={24} />} title={items.length ? copy.noMatches : copy.noSources} description={items.length ? copy.tryAnother : emptySourceDescription} /> : null}
      {!loading && visibleItems.length > 0 ? <SourceMasonry density={density} isBatchSelecting={isBatchSelecting} items={visibleItems} selectedIds={selectedIds} hasMore={Boolean(nextCursor)} isLoadingMore={isLoadingMore} onCopy={copySource} onFavorite={toggleFavorite} onLoadMore={() => void loadMoreItems()} onOpen={(item) => { setFocusDetailNote(false); setDetailItem(item); }} onEditNote={(item) => { setFocusDetailNote(true); setDetailItem(item); }} onOpenLocal={openLocalFile} onPreview={setPreviewItem} onRequestDownload={setDownloadConfirmItem} onRetryDownload={setDownloadConfirmItem} onToggle={toggleSelected} /> : null}
      {isBatchSelecting ? <footer className="sources-footer sources-batch-footer"><div className="sources-selection-summary"><span>{selectedIds.length} {selectedIds.length === 1 ? copy.sourceSelected : copy.sourcesSelected}</span><button className="text-button sources-select-all-button" disabled={!visibleItems.length || selectedIds.length === visibleItems.length && selectedIds.every((id) => visibleItems.some((item) => item.id === id))} onClick={selectVisibleItems} type="button">{copy.selectAll}</button>{hasReusableSelection ? <button className="text-button sources-select-all-button" onClick={restoreLastSelection} type="button">{language === "zh" ? "使用上一次选择" : "Use previous selection"}</button> : null}</div><div className="sources-footer-actions"><button className="secondary-button sources-delete-button" disabled={!selectedIds.length} onClick={() => setIsDeleteOpen(true)} type="button"><Trash2 size={15} />{copy.delete}</button><button className="secondary-button" disabled={!selectedIds.length} onClick={() => setIsBatchNoteOpen(true)} type="button"><MessageSquare size={15} />{copy.addNote}</button><div className="sources-pack-wrap" ref={bookTransferRef}><button aria-expanded={isBookTransferOpen} className={`secondary-button sources-transfer-button ${isBookTransferOpen ? "is-open" : ""}`} disabled={!selectedIds.length} onClick={() => { setIsPackOpen(false); setIsBookTransferOpen((open) => !open); }} type="button"><ArrowRightLeft size={15} />{copy.addToOtherBook}</button>{isBookTransferOpen ? <BookTransferPopover books={books.filter((book) => book.id !== activeBookId)} count={selectedIds.length} isTransferring={isTransferringSelected} onClose={() => setIsBookTransferOpen(false)} onTransfer={transferSelectedSources} /> : null}</div><div className="sources-pack-wrap" ref={packRef}><button aria-expanded={isPackOpen} className={`primary-button sources-pack-button ${isPackOpen ? "is-open" : ""}`} disabled={!selectedIds.length} onClick={() => { setIsBookTransferOpen(false); setIsPackOpen((open) => !open); }} type="button"><Package size={15} />{copy.packForAgent}</button>{isPackOpen ? <PackPopover items={selectedItems} language={language} onClose={() => setIsPackOpen(false)} onCopyMaterials={copyPackedMaterials} onCopyPrompt={copyPackPrompt} /> : null}</div><button aria-label={copy.clear} className="secondary-button sources-cancel-button" data-tooltip={copy.clear} onClick={exitBatchSelection} type="button"><X size={17} /></button></div></footer> : !loading && visibleItems.length > 0 ? <button className="batch-actions-fab" onClick={() => setIsBatchSelecting(true)} type="button"><ListChecks size={16} />{language === "zh" ? "批量操作" : "Batch actions"}</button> : null}
      {message ? <p className={`sources-message is-${messageTone}`} role="status">{isRefreshing || isImporting ? <LoaderCircle className="spin" size={14} /> : messageTone === "success" ? <CircleCheck aria-hidden="true" size={15} /> : messageTone === "error" ? <CircleX aria-hidden="true" size={15} /> : null}{message}</p> : null}
    </section>
    <SourceDetailModal focusNote={focusDetailNote} item={detailItem} onClose={() => { setFocusDetailNote(false); setDetailItem(null); }} onContentSave={saveContent} onCopy={copySource} onDelete={removeItem} onFavorite={toggleFavorite} onNoteSave={saveNote} onOpenLocal={openLocalFile} onPreview={setPreviewItem} onRequestDownload={setDownloadConfirmItem} onRetryDownload={startDownload} onRevealLocal={revealLocalFile} onTitleSave={saveTitle} />
    <DeleteModal count={selectedIds.length} isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={() => void removeSelected()} />
    <CreateBookModal isOpen={isCreateBookOpen} onClose={() => setIsCreateBookOpen(false)} onCreate={createBook} />
    <CreateTextModal isOpen={isCreateTextOpen} onClose={() => setIsCreateTextOpen(false)} onCreate={createTextSource} />
    <RenameBookModal book={renameBookTarget} canDelete={books.length > 1} onClose={() => setRenameBookTarget(null)} onDelete={() => { if (renameBookTarget) { setDeleteBookTarget(renameBookTarget); setRenameBookTarget(null); } }} onRename={renameBook} />
    <DeleteBookModal book={deleteBookTarget} onClose={() => setDeleteBookTarget(null)} onConfirm={removeBook} />
    <TransferModal books={books.filter((book) => book.id !== activeBookId)} item={transferItem} onClose={() => setTransferItem(null)} onTransfer={transferSource} />
    <BatchNoteModal count={selectedIds.length} isOpen={isBatchNoteOpen} onClose={() => setIsBatchNoteOpen(false)} onConfirm={appendBatchNote} />
    <SourcePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    <DownloadImageModal item={downloadConfirmItem} onClose={() => setDownloadConfirmItem(null)} onConfirm={startDownload} />
    <ClearLocalDataModal isClearing={isClearingData} isOpen={isClearDataOpen} onClose={() => !isClearingData && setIsClearDataOpen(false)} onConfirm={() => void clearLocalData()} />
    <BackupExportModal books={books} isOpen={isBackupExportOpen} onClose={() => setIsBackupExportOpen(false)} onExport={exportBackup} onSelectionChange={setBackupBookIds} selectedBookIds={backupBookIds} />
    <PromptSettingsModal isOpen={isPromptSettingsOpen} language={language} savedTemplate={promptTemplate} onClose={() => setIsPromptSettingsOpen(false)} onSave={savePromptTemplate} />
    <LocalDataManagerModal isOpen={isLibrarySettingsOpen} language={language} onClear={() => { setIsLibrarySettingsOpen(false); setIsClearDataOpen(true); }} onClose={() => setIsLibrarySettingsOpen(false)} onExport={() => { setIsLibrarySettingsOpen(false); openBackupExport(); }} onImport={() => { setIsLibrarySettingsOpen(false); backupInputRef.current?.click(); }} onLoad={setLibrarySettings} onMigrated={() => showSourcesMessage(language === "zh" ? "素材库已迁移到新位置。" : "Your library was moved to the new location.", 3600, "success")} settings={librarySettings} />
    <UpdateSettingsModal isOpen={isUpdateSettingsOpen} language={language} onClose={() => setIsUpdateSettingsOpen(false)} onLoad={setUpdateSettings} settings={updateSettings} />
    <MCPSettingsModal isOpen={isMCPSettingsOpen} language={language} onClose={() => setIsMCPSettingsOpen(false)} onLoad={setMCPSettings} settings={mcpSettings} />
    <MCPSuggestionsModal isOpen={isMCPSuggestionsOpen} language={language} onClose={() => setIsMCPSuggestionsOpen(false)} onConnectAgent={() => { setIsMCPSuggestionsOpen(false); setIsMCPSettingsOpen(true); }} onLoad={(suggestions) => { knownPendingSuggestionIdsRef.current = new Set(suggestions.filter((entry) => entry.suggestion.status === "pending").map((entry) => entry.suggestion.id)); setMCPSuggestions(suggestions); }} onReview={async (bookId, suggestionId, decision) => { await request(`/api/mcp/suggestions/${encodeURIComponent(bookId)}/${encodeURIComponent(suggestionId)}/${decision}`, { method: "POST" }); await refreshMCPSuggestions(); await loadItems({ background: true }); }} suggestions={mcpSuggestions} />
  </main></LanguageContext.Provider>;
}

function SourceMasonry({ density, isBatchSelecting, items, selectedIds, hasMore, isLoadingMore, onLoadMore, onCopy, onFavorite, onOpen, onEditNote, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onToggle }: { density: CardDensity; isBatchSelecting: boolean; items: SourceItem[]; selectedIds: string[]; hasMore: boolean; isLoadingMore: boolean; onLoadMore: () => void; onCopy: (item: SourceItem) => Promise<void>; onFavorite: (id: string, favorite: boolean) => void; onOpen: (item: SourceItem) => void; onEditNote: (item: SourceItem) => void; onOpenLocal: (item: SourceItem) => void; onPreview: (item: SourceItem) => void; onRequestDownload: (item: SourceItem) => void; onRetryDownload: (item: SourceItem) => void; onToggle: (id: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const ref = useRef<HTMLDivElement | null>(null); const [columnCount, setColumnCount] = useState(4);
  useEffect(() => { const element = ref.current; if (!element) return; const minWidth = density === "compact" ? 198 : density === "spacious" ? 340 : 258; const update = () => setColumnCount(element.clientWidth < 500 ? 1 : Math.max(2, Math.min(8, Math.floor((element.clientWidth + 16) / (minWidth + 16))))); update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect(); }, [density]);
  const columns = Array.from({ length: columnCount }, () => [] as SourceItem[]); items.forEach((item, index) => columns[index % columnCount].push(item));
  return <div className={`source-masonry density-${density} ${isBatchSelecting ? "is-selecting" : ""}`} ref={ref}><div className="source-masonry-columns" style={{ "--source-column-count": columnCount } as React.CSSProperties}>{columns.map((column, index) => <div className="source-masonry-column" key={index}>{column.map((item) => <SourceCard isBatchSelecting={isBatchSelecting} item={item} key={item.id} selected={selectedIds.includes(item.id)} onCopy={() => void onCopy(item)} onFavorite={() => onFavorite(item.id, !item.favorite)} onOpen={() => onOpen(item)} onEditNote={() => onEditNote(item)} onOpenLocal={() => onOpenLocal(item)} onPreview={() => onPreview(item)} onRequestDownload={() => onRequestDownload(item)} onRetryDownload={() => onRetryDownload(item)} onToggle={() => onToggle(item.id)} />)}</div>)}</div>{hasMore ? <div className="source-load-more"><button className="secondary-button" disabled={isLoadingMore} onClick={onLoadMore} type="button">{isLoadingMore ? copy.loading : copy.loadMore}</button></div> : null}</div>;
}

function SourceCard({ isBatchSelecting, item, selected, onCopy, onFavorite, onOpen, onEditNote, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onToggle }: { isBatchSelecting: boolean; item: SourceItem; selected: boolean; onCopy: () => void; onFavorite: () => void; onOpen: () => void; onEditNote: () => void; onOpenLocal: () => void; onPreview: () => void; onRequestDownload: () => void; onRetryDownload: () => void; onToggle: () => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language];
  const excerpt = descriptionFor(item);
  const isWebLink = item.modality === "link" && item.pickType !== "local_import";
  const isPost = item.modality === "post";
  const post = isPost ? item.metadata.post : undefined;
  const isWebVideo = isWebVideoReference(item);
  const isFileCard = item.modality === "file" || item.modality === "link" && item.pickType === "local_import";
  const usesCardSourceMark = isFileCard || item.modality === "audio" || isWebLink || isPost;
  const hasTextArtwork = item.modality === "text" || item.modality === "conversation";
  const hasVisual = !usesCardSourceMark && (["image", "video", "conversation"].includes(item.modality) || hasTextArtwork);
  const isPlayable = (item.modality === "video" || item.modality === "audio") && !isWebVideo;
  const previewable = item.modality === "image" || isPlayable;
  const openableLocalFile = item.modality === "file" && localFileState(item) === "cached";
  const showVideoCover = item.modality === "video" && localFileState(item) !== "cached";
  const duration = useMediaDuration(item);
  const previewLabel = item.modality === "audio" ? copy.play + " " + copy.audio : item.modality === "video" ? copy.play + " " + copy.video : copy.view + " " + copy.image;
  const usesFallbackArtwork = hasVisual && !hasTextArtwork && !hasRenderableThumbnail(item);
  return <article aria-pressed={isBatchSelecting ? selected : undefined} className={`source-masonry-card kind-${item.modality} ${usesCardSourceMark ? "has-card-source-mark" : ""} ${usesFallbackArtwork ? "has-fallback-artwork" : ""} ${selected ? "selected" : ""} ${item.favorite ? "favorited" : ""} ${isBatchSelecting ? "is-batch-selecting" : ""}`} onClick={isBatchSelecting ? onToggle : onOpen}>
    <div className="source-card-hover-actions">
      {previewable ? <button aria-label={previewLabel} className="source-card-quick-action" data-tooltip={previewLabel} onClick={(event) => { event.stopPropagation(); onPreview(); }} type="button">{isPlayable ? <Play fill="currentColor" size={15} /> : <Maximize2 size={15} />}</button> : null}
      {(isWebLink || isPost || isWebVideo) ? <button aria-label={copy.visit} className="source-card-quick-action" data-tooltip={copy.visit} onClick={(event) => { event.stopPropagation(); openWebLink(item); }} type="button"><ExternalLink size={15} /></button> : null}
      {openableLocalFile ? <button aria-label={copy.open} className="source-card-quick-action" data-tooltip={copy.open} onClick={(event) => { event.stopPropagation(); onOpenLocal(); }} type="button"><ExternalLink size={15} /></button> : null}
      <button aria-label={item.favorite ? copy.removeFavorite : copy.addFavorite} aria-pressed={item.favorite} className={`favorite-star source-card-favorite ${item.favorite ? "active" : ""}`} data-tooltip={item.favorite ? copy.removeFavorite : copy.addFavorite} onClick={(event) => { event.stopPropagation(); event.currentTarget.blur(); onFavorite(); }} type="button"><Star size={13} fill={item.favorite ? "currentColor" : "none"} /></button>
      <button aria-label={isBatchSelecting ? copy.openDetail : copy.copy} className="source-select-button" data-tooltip={isBatchSelecting ? copy.openDetail : copy.copy} onClick={(event) => { event.stopPropagation(); event.currentTarget.blur(); if (isBatchSelecting) onOpen(); else onCopy(); }} type="button">{isBatchSelecting ? <><Eye size={14} /><span className="source-select-label">{copy.view}</span></> : <><Copy size={14} /><span className="source-select-label">{copy.copy}</span></>}</button>
    </div>
    {item.favorite ? <button aria-label={copy.removeFavorite} className="source-card-favorite-pinned" data-tooltip={copy.removeFavorite} onClick={(event) => { event.stopPropagation(); event.currentTarget.blur(); onFavorite(); }} type="button"><Star fill="currentColor" size={13} /></button> : null}
    {usesCardSourceMark ? <CardSourceMark item={item} /> : null}
    {hasVisual ? <div className="source-masonry-media preserve-media-ratio">{item.modality === "conversation" || item.modality === "text" ? <CardSourceMark item={item} /> : null}{previewable ? <button aria-label={copy.openDetail} className="source-masonry-media-button" data-tooltip={copy.openDetail} onClick={(event) => { event.stopPropagation(); if (isBatchSelecting) onToggle(); else onOpen(); }} type="button"><SourceThumbnail item={item} /></button> : <SourceThumbnail item={item} />}{showVideoCover ? <span className="video-cover-label">{copy.cover}</span> : null}{(item.modality === "video" || item.modality === "audio") && duration !== null ? <span className="media-duration">{formatDuration(duration)}</span> : null}</div> : null}
    <div className="source-masonry-body"><h2 title={item.itemTitle}>{item.itemTitle}</h2><div className="source-masonry-meta"><DataStatus item={item} onRequestDownload={onRequestDownload} onRetryDownload={onRetryDownload} /><div className="source-masonry-origin"><span>{sourceLabel(item)}</span><time>{formatDate(item.pickedAt)}</time></div></div>{post ? <PostByline className="post-card-meta" post={post} /> : null}{!hasTextArtwork && excerpt ? <p className="source-masonry-excerpt">{excerpt}</p> : null}{!hasVisual && !usesCardSourceMark && !excerpt ? <div className="source-masonry-abstract"><SourceThumbnail item={item} /></div> : null}<div className="source-card-actions"><button className={`source-note-summary ${item.userNote ? "has-note" : "is-empty"}`} onClick={(event) => { event.stopPropagation(); onEditNote(); }} title={item.userNote || `${copy.addNote}…`} type="button"><MessageSquare aria-hidden="true" size={12} /><span>{item.userNote || `${copy.addNote}…`}</span></button></div></div>
  </article>;
}

function SourceThumbnail({ item, compact = false }: { item: SourceItem; compact?: boolean }) {
  const isLocalFile = item.modality === "file" || item.modality === "link" && item.pickType === "local_import";
  const isWebLink = item.modality === "link" && !isLocalFile;
  const Icon = isLocalFile ? FileText : kindIcon[item.modality];
  const fileLabel = isLocalFile ? (item.fileName?.split(".").at(-1) || fileFormat(item.mimeType)).toUpperCase() : null;
  const useVideoFrame = item.modality === "video" && item.assetCacheState === "cached" && !item.metadata.mediaPreviewUrl && Boolean(item.thumbnailUrl);
  const [imagePreviewSrc, setImagePreviewSrc] = useState(item.thumbnailUrl || item.metadata.mediaPreviewUrl);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const useImagePreview = !isWebLink && hasRenderableThumbnail(item) && !useVideoFrame && Boolean(imagePreviewSrc) && !imagePreviewFailed;
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string | undefined>();
  useEffect(() => { setVideoFrameReady(false); }, [item.id, item.thumbnailUrl, useVideoFrame]);
  useEffect(() => { setVideoAspectRatio(undefined); }, [item.id, item.thumbnailUrl, useVideoFrame]);
  useEffect(() => { setImagePreviewSrc(item.thumbnailUrl || item.metadata.mediaPreviewUrl); setImagePreviewFailed(false); }, [item.id, item.thumbnailUrl, item.metadata.mediaPreviewUrl]);
  const handleImagePreviewError = () => {
    const fallback = item.metadata.mediaPreviewUrl;
    if (fallback && fallback !== imagePreviewSrc) {
      setImagePreviewSrc(fallback);
      return;
    }
    setImagePreviewFailed(true);
  };
  const readVideoMetadata = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) setVideoAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
    if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = Math.min(0.1, video.duration / 2);
  };
  return <div className={`thumb ${compact ? "compact" : ""} ${item.modality === "link" && !isLocalFile ? "webpage-artwork" : ""}`} style={!compact && videoAspectRatio ? { aspectRatio: videoAspectRatio } : undefined}>
    {item.modality === "text" || item.modality === "conversation" ? <TextArtwork item={item} /> : null}
    {item.modality !== "text" && item.modality !== "conversation" && useVideoFrame ? <><span className="thumb-fallback"><Icon size={compact ? 19 : 28} /></span><video className={`media-thumb media-video-frame ${videoFrameReady ? "is-ready" : ""}`} muted onCanPlay={() => setVideoFrameReady(true)} onError={() => setVideoFrameReady(false)} onLoadedMetadata={(event) => readVideoMetadata(event.currentTarget)} playsInline preload="auto" src={item.thumbnailUrl ?? undefined} /></> : null}
    {item.modality !== "text" && item.modality !== "conversation" && !useVideoFrame && useImagePreview ? <img className="media-thumb" src={imagePreviewSrc} alt="" onError={handleImagePreviewError} /> : null}
    {item.modality !== "text" && item.modality !== "conversation" && !useVideoFrame && !useImagePreview ? <span className="thumb-fallback">{fileLabel ? <span className="thumb-file-format">{fileLabel}</span> : item.modality === "video" ? <VideoFallbackArtwork compact={compact} /> : item.modality === "link" && !isLocalFile ? <LinkArtwork compact={compact} item={item} /> : <Icon size={compact ? 19 : 28} />}</span> : null}
  </div>;
}

function VideoFallbackArtwork({ compact }: { compact: boolean }) {
  return <span className={`video-fallback-artwork ${compact ? "is-compact" : ""}`} aria-hidden="true"><span className="video-fallback-label">VIDEO</span><span className="video-fallback-play"><Play aria-hidden="true" fill="currentColor" size={compact ? 13 : 22} /></span><span className="video-fallback-track" /></span>;
}

function FileIdentity({ item }: { item: SourceItem }) {
  const extension = (item.fileName?.split(".").at(-1) || fileFormat(item.mimeType)).toUpperCase();
  return <span className="file-identity"><FileText aria-hidden="true" size={16} strokeWidth={1.8} /><span>{extension}</span></span>;
}

function LinkArtwork({ compact = false, item, large = false }: { compact?: boolean; item: SourceItem; large?: boolean }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  useEffect(() => { setFaviconFailed(false); }, [item.faviconUrl]);
  const hasFavicon = Boolean(item.faviconUrl) && !faviconFailed;
  return <span className={`link-artwork ${compact ? "is-compact" : ""} ${large ? "is-large" : ""}`}><span className="link-artwork-logo">{hasFavicon ? <img src={item.faviconUrl ?? undefined} alt="" onError={() => setFaviconFailed(true)} /> : <Globe2 aria-hidden="true" size={compact ? 15 : 18} />}</span><span>{sourceLabel(item)}</span></span>;
}

function TextArtwork({ item }: { item: SourceItem }) { const rawContent = item.contentText ?? item.metadata.description ?? item.itemTitle; const content = rawContent.trim() ? rawContent : item.itemTitle; return <div className={`text-artwork ${item.modality === "conversation" ? "is-chat" : ""}`}><MarkdownContent compact value={content} /></div>; }

function CardSourceMark({ item }: { item: SourceItem }) {
  const language = useLanguage();
  const [logoFailed, setLogoFailed] = useState(false);
  const mediaDuration = useMediaDuration(item);
  const isFile = item.modality === "file" || item.modality === "link" && item.pickType === "local_import";
  const isConversation = item.modality === "conversation";
  const isPost = item.modality === "post";
  const rawProvider = item.metadata.conversation?.provider?.trim() || item.sourceTitle?.trim() || sourceLabel(item);
  const providerKey = rawProvider.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const providerNames: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", deepseek: "DeepSeek", grok: "Grok", kimi: "Kimi" };
  const format = sourceFormat(item);
  const postPlatform = postPlatformFor(item);
  const label = isPost ? postPlatformLabel(postPlatform, language) : isConversation ? providerNames[providerKey] ?? rawProvider : isFile ? `${format}｜${item.fileSize === null ? "—" : formatBytes(item.fileSize, language)}` : item.modality === "audio" ? `${format}｜${mediaDuration === null ? "—" : formatDuration(mediaDuration)}` : item.modality === "text" ? interfaceCopy[language].text : sourceLabel(item);
  const Icon = isFile ? FileText : item.modality === "audio" ? Music2 : isConversation ? Sparkles : item.modality === "text" ? AlignLeft : Globe2;
  const logo = isPost && postPlatform === "xiaohongshu" ? "/xiaohongshu-mark.svg" : item.faviconUrl;
  const canUseFavicon = (isConversation || item.modality === "link" || isPost) && Boolean(logo);
  useEffect(() => { setLogoFailed(false); }, [logo]);
  return <span className={`source-card-source-mark is-${isFile ? "file" : item.modality}`}><span className="source-card-source-logo">{canUseFavicon && !logoFailed ? <img src={logo ?? undefined} alt="" onError={() => setLogoFailed(true)} /> : <Icon aria-hidden="true" className="source-card-source-fallback" size={16} strokeWidth={1.8} />}</span><span>{label}</span></span>;
}

function MarkdownContent({ compact = false, value }: { compact?: boolean; value: string }) { return <div className="markdown-content"><ReactMarkdown components={{ table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>, ...(compact ? { img: () => null } : {}) }} remarkPlugins={[remarkGfm]} skipHtml>{value}</ReactMarkdown></div>; }

function MarkdownContentEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedHtmlRef = useRef<string | null>(null);
  const save = () => {
    const html = editorRef.current?.innerHTML;
    if (html === undefined || focusedHtmlRef.current === html) return;
    const editor = editorRef.current;
    editor?.querySelectorAll("th[style*='text-align']").forEach((cell) => {
      const alignment = (cell as HTMLElement).style.textAlign;
      if (alignment) cell.setAttribute("align", alignment);
    });
    const markdown = markdownSerializer.turndown(editor?.innerHTML ?? html).trimEnd();
    if (markdown !== value) onSave(markdown);
  };
  return <section className="source-item-content-preview markdown-content-preview"><div aria-label={copy.markdownContent} className="markdown-render-editor" contentEditable onBlur={save} onFocus={() => { focusedHtmlRef.current = editorRef.current?.innerHTML ?? null; }} ref={editorRef} role="textbox" suppressContentEditableWarning><MarkdownContent value={value} /></div></section>;
}

function hasRenderableThumbnail(item: SourceItem) {
  if (!item.thumbnailUrl) return false;
  if (item.modality === "audio") return Boolean(item.metadata.mediaPreviewUrl);
  if (item.modality === "video") return Boolean(item.metadata.mediaPreviewUrl) || item.assetCacheState === "cached";
  return item.modality === "image" || item.modality === "post" || (item.modality === "link" && item.pickType !== "local_import");
}

function isWebVideoReference(item: SourceItem) {
  return item.modality === "video" && item.pickType !== "local_import" && Boolean(webLinkFor(item));
}

function useMediaDuration(item: SourceItem) {
  const declared = typeof item.metadata.mediaDurationSeconds === "number" && Number.isFinite(item.metadata.mediaDurationSeconds) ? item.metadata.mediaDurationSeconds : null;
  const [duration, setDuration] = useState<number | null>(declared);
  useEffect(() => { setDuration(declared); }, [declared, item.id]);
  useEffect(() => {
    if (declared !== null || (item.modality !== "video" && item.modality !== "audio") || item.assetCacheState !== "cached") return;
    const src = item.contentUrl ?? item.thumbnailUrl;
    if (!src) return;
    const media = document.createElement(item.modality === "video" ? "video" : "audio");
    media.preload = "metadata";
    const onMetadata = () => { if (Number.isFinite(media.duration) && media.duration >= 0) setDuration(media.duration); };
    media.addEventListener("loadedmetadata", onMetadata);
    media.src = src;
    return () => { media.removeEventListener("loadedmetadata", onMetadata); media.removeAttribute("src"); media.load(); };
  }, [declared, item.assetCacheState, item.contentUrl, item.id, item.modality, item.thumbnailUrl]);
  return duration;
}
function DataStatus({ item, onRequestDownload, onRetryDownload }: { item: SourceItem; onRequestDownload?: () => void; onRetryDownload?: () => void }) {
  const copy = interfaceCopy[useLanguage()];
  const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();
  const isImageWithRemoteFile = item.modality === "image" && Boolean(item.contentUrl);
  const link = item.linkState === "none" ? null : item.linkState === "invalid" ? <span aria-label={copy.invalidLink} className="data-status-badge is-invalid is-icon" data-tooltip={copy.invalidLink}><Link2Off size={13} /></span> : <a aria-label={copy.visit} className="data-status-badge is-link is-action is-icon" data-tooltip={copy.visit} href={item.sourceUrl} onClick={stopPropagation} rel="noreferrer" target="_blank"><Link2 size={13} /></a>;
  if (!isImageWithRemoteFile) return <>{link}{item.assetCacheState === "cached" ? <a aria-label={copy.localFile} className="data-status-badge is-local is-action is-icon" data-tooltip={copy.localFile} href={item.thumbnailUrl ?? item.sourceUrl} onClick={stopPropagation} rel="noreferrer" target="_blank"><HardDrive size={13} /></a> : null}</>;
  const state = localState(item);
  const local = state === "downloading" ? <span aria-label={copy.downloading} className="data-status-badge is-downloading is-icon" data-tooltip={copy.downloading}><LoaderCircle className="spin" size={13} /></span> : state === "local" ? <a aria-label={copy.viewLocalFile} className="data-status-badge is-local is-action is-icon" data-tooltip={copy.viewLocalFile} href={item.thumbnailUrl ?? item.sourceUrl} onClick={stopPropagation} rel="noreferrer" target="_blank"><HardDrive size={13} /></a> : state === "missing" && onRequestDownload ? <button aria-label={copy.fileMissing} className="data-status-badge is-missing is-icon" data-tooltip={copy.fileMissing} onClick={(event) => { event.stopPropagation(); onRequestDownload(); }} type="button"><FileWarning size={13} /></button> : state === "failed" && onRetryDownload ? <button aria-label={copy.downloadFailed} className="data-status-badge is-failed is-icon" data-tooltip={copy.downloadFailed} onClick={(event) => { event.stopPropagation(); onRetryDownload(); }} type="button"><CloudOff size={13} /></button> : null;
  return <>{link}{local}</>;
}
function SourcebookMark({ size = 28 }: { size?: number }) { return <svg aria-hidden="true" className="sourcebook-mark" height={size} viewBox="0 0 256 256" width={size}><g fill="currentColor"><rect x="36" y="60" width="42" height="28" rx="5" /><rect x="36" y="105" width="42" height="28" rx="5" /><rect x="36" y="150" width="42" height="28" rx="5" /><rect x="66" y="36" width="166" height="166" rx="15" /><rect x="94" y="190" width="36" height="34" rx="6" /><rect x="168" y="190" width="36" height="34" rx="6" /></g><path d="m133 100 19 20-19 20" fill="none" stroke="var(--mark-eye, #fff)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="18" /><rect x="179" y="91" width="18" height="58" rx="9" fill="var(--mark-eye, #fff)" /></svg>; }
function SourcebookLockup() { return <div className="sourcebook-lockup"><SourcebookMark size={31} /><div className="sourcebook-wordmark">sourcebook<span>for agents</span></div></div>; }
function FilterPopover({ copy, dateEnd, dateFilter, dateStart, kind, linkFilter, localFilter, source, sourceOptions, onDateEndChange, onDateFilterChange, onDateStartChange, onKindChange, onLinkFilterChange, onLocalFilterChange, onSourceChange, onReset }: { copy: typeof interfaceCopy.en | typeof interfaceCopy.zh; dateEnd: string; dateFilter: DateFilter; dateStart: string; kind: Modality[]; linkFilter: Exclude<LinkFilter, "all">[]; localFilter: Exclude<LocalFilter, "all">[]; source: string[]; sourceOptions: string[]; onDateEndChange: (value: string) => void; onDateFilterChange: (value: Exclude<DateFilter, "all">) => void; onDateStartChange: (value: string) => void; onKindChange: (kind: Modality) => void; onLinkFilterChange: (value: Exclude<LinkFilter, "all">) => void; onLocalFilterChange: (value: Exclude<LocalFilter, "all">) => void; onSourceChange: (source: string) => void; onReset: () => void }) {
  const language = useLanguage();
  const filtered = Boolean(kind.length || source.length || linkFilter.length || localFilter.length || dateFilter !== "all");
  const zh = language === "zh";
  const labels = zh
    ? { reset: "重置", time: "时间", today: "今天", yesterday: "昨天", week: "本周", custom: "自定义", start: "开始日期", end: "结束日期", type: "类型", source: "来源", link: "链接状态", local: "本地文件", linked: "链接", invalid: "链接失效", pending: "无本地文件", saved: "本地文件", missing: "文件丢失", failed: "下载失败", downloading: "下载中" }
    : { reset: "Reset", time: "Time", today: "Today", yesterday: "Yesterday", week: "This week", custom: "Date range", start: "Start date", end: "End date", type: "Type", source: "Source", link: "Link", local: "Local file", linked: "Linked", invalid: "Invalid link", pending: "No local file", saved: "Local file", missing: "File missing", failed: "Download failed", downloading: "Downloading" };
  const dates: { id: Exclude<DateFilter, "all">; label: string }[] = [{ id: "today", label: labels.today }, { id: "yesterday", label: labels.yesterday }, { id: "week", label: labels.week }, { id: "custom", label: labels.custom }];
  const links: { id: Exclude<LinkFilter, "all">; label: string }[] = [{ id: "linked", label: labels.linked }, { id: "invalid", label: labels.invalid }];
  const locals: { id: Exclude<LocalFilter, "all">; label: string }[] = [{ id: "pending", label: labels.pending }, { id: "downloading", label: labels.downloading }, { id: "local", label: labels.saved }, { id: "missing", label: labels.missing }, { id: "failed", label: labels.failed }];
  return <div className="source-item-filter-popover"><div className="filter-popover-head"><strong>{copy.filter}</strong><button disabled={!filtered} onClick={onReset} type="button">{labels.reset}</button></div><section className="filter-section"><h2>{labels.time}</h2><div className="filter-row">{dates.map((entry) => <button aria-pressed={dateFilter === entry.id} className="filter-chip" key={entry.id} onClick={() => onDateFilterChange(entry.id)} type="button">{entry.label}</button>)}</div>{dateFilter === "custom" ? <div className="date-range-row"><input aria-label={labels.start} type="date" value={dateStart} onChange={(event) => onDateStartChange(event.target.value)} /><input aria-label={labels.end} type="date" value={dateEnd} onChange={(event) => onDateEndChange(event.target.value)} /></div> : null}</section><section className="filter-section"><h2>{labels.type}</h2><div className="filter-row">{(["image", "text", "video", "audio", "file", "link", "post", "conversation"] as const).map((entry) => <button aria-pressed={kind.includes(entry)} className="filter-chip" key={entry} onClick={() => onKindChange(entry)} type="button">{kindLabel(entry, language)}</button>)}</div></section><section className="filter-section"><h2>{labels.link}</h2><div className="filter-row">{links.map((entry) => <button aria-pressed={linkFilter.includes(entry.id)} className="filter-chip" key={entry.id} onClick={() => onLinkFilterChange(entry.id)} type="button">{entry.label}</button>)}</div></section><section className="filter-section"><h2>{labels.local}</h2><div className="filter-row">{locals.map((entry) => <button aria-pressed={localFilter.includes(entry.id)} className="filter-chip" key={entry.id} onClick={() => onLocalFilterChange(entry.id)} type="button">{entry.label}</button>)}</div></section><section className="filter-section source-filter-section"><h2>{labels.source}</h2><div className="filter-row">{sourceOptions.map((entry) => <button aria-pressed={source.includes(entry)} className="filter-chip" key={entry} onClick={() => onSourceChange(entry)} type="button">{entry}</button>)}</div></section></div>;
}

function SourceDetailModal({ focusNote, item, onClose, onContentSave, onCopy, onDelete, onFavorite, onNoteSave, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onRevealLocal, onTitleSave }: { focusNote: boolean; item: SourceItem | null; onClose: () => void; onContentSave: (id: string, value: string) => void; onCopy: (item: SourceItem) => Promise<void>; onDelete: (id: string) => void; onFavorite: (id: string, favorite: boolean) => void; onNoteSave: (id: string, value: string) => void; onOpenLocal: (item: SourceItem) => void; onPreview: (item: SourceItem) => void; onRequestDownload: (item: SourceItem) => void; onRetryDownload: (item: SourceItem) => void; onRevealLocal: (item: SourceItem) => void; onTitleSave: (id: string, value: string) => Promise<boolean> }) {
  const language = useLanguage(); const copy = interfaceCopy[language];
  const [draftTitle, setDraftTitle] = useState(item?.itemTitle ?? "");
  const [draftNote, setDraftNote] = useState(item?.userNote ?? "");
  const [draftContent, setDraftContent] = useState(item?.contentText ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { setDraftTitle(item?.itemTitle ?? ""); setDraftNote(item?.userNote ?? ""); setDraftContent(item?.contentText ?? ""); setConfirmDelete(false); setIsEditingTitle(false); }, [item?.id, item?.itemTitle, item?.userNote, item?.contentText]);
  useEffect(() => { if (focusNote && item) requestAnimationFrame(() => noteRef.current?.focus()); }, [focusNote, item?.id]);
  if (!item) return null;
  const page = item.modality === "link" && item.pickType !== "local_import";
  const post = item.modality === "post" ? item.metadata.post : undefined;
  const webVideo = isWebVideoReference(item);
  const storedFileState = localFileState(item);
  const webLink = webLinkFor(item);
  const copyAction = hasCopyablePackFile(item) ? copy.copyFiles : webLink ? copy.copyLink : copy.copy;
  const saveTitle = async () => { const title = draftTitle.trim(); if (!title) return; if (title === item.itemTitle) { setIsEditingTitle(false); return; } if (await onTitleSave(item.id, title)) setIsEditingTitle(false); };
  const cancelTitleEdit = () => { setDraftTitle(item.itemTitle); setIsEditingTitle(false); };
  const saveNote = () => { if (draftNote !== item.userNote) onNoteSave(item.id, draftNote); };
  return <div className="masonry-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <button aria-label={copy.closeDetail} className="media-preview-close" data-tooltip={copy.closeDetail} onClick={onClose} type="button"><X size={18} /></button>
    <aside className="inspector-popover masonry-detail-modal" aria-label="Source detail" aria-modal="true" role="dialog">
      <div className="inspector-body read-only-detail">
        <div className="detail-resource-header"><div className="detail-resource-main"><div className="detail-title-control">{isEditingTitle ? <><input autoFocus aria-label={copy.sourceTitle} className="detail-title-input" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(); if (event.key === "Escape") cancelTitleEdit(); }} /><div className="detail-title-actions"><button aria-label={copy.saveTitle} className="detail-title-action is-confirm" data-tooltip={copy.save} disabled={!draftTitle.trim()} onClick={() => void saveTitle()} type="button"><Check size={14} /></button><button aria-label={copy.cancelTitleEdit} className="detail-title-action" data-tooltip={copy.cancel} onClick={cancelTitleEdit} type="button"><X size={14} /></button></div></> : <><h2 className="detail-title-value" title={item.itemTitle}>{item.itemTitle}</h2><button aria-label={copy.editTitle} className="detail-title-action" data-tooltip={copy.editTitle} onClick={() => setIsEditingTitle(true)} type="button"><Pencil size={14} /></button></>}</div></div></div>
        {post ? <PostDetailPreview item={item} post={post} /> : page ? <WebPageDetailPreview item={item} /> : null}
        {!page && item.modality === "image" && item.thumbnailUrl ? <figure className="detail-media-preview" role="button" tabIndex={0} onClick={() => onPreview(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onPreview(item); }}><img src={item.thumbnailUrl} alt={item.itemTitle} /></figure> : null}
        {!page && webVideo ? <WebVideoDetailPreview item={item} /> : null}
        {!page && !webVideo && item.modality === "video" && (item.contentUrl || item.thumbnailUrl) ? <figure className="detail-media-preview"><video controls muted playsInline preload="metadata" src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /></figure> : null}
        {!page && item.modality === "audio" && (item.contentUrl || item.thumbnailUrl) ? <figure className="detail-audio-preview"><audio controls autoPlay preload="metadata" src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /></figure> : null}
        {(item.modality === "text" || item.modality === "conversation") && item.contentText !== null ? <MarkdownContentEditor onSave={(value) => { setDraftContent(value); onContentSave(item.id, value); }} value={draftContent} /> : null}
        {!page && item.modality === "file" && storedFileState === "cached" ? <LocalFileDetailPreview item={item} onOpen={() => onOpenLocal(item)} /> : null}
        <div className="detail-primary-edit"><section className="description-editor"><div className="description-editor-heading"><span className="field-label-row">{copy.note} <span className="info-tooltip" data-tooltip={copy.noteHelp}><CircleHelp size={12} /></span></span></div><textarea aria-label={copy.note} placeholder={copy.addContext} ref={noteRef} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} onBlur={saveNote} /></section></div>
        <section className="inspector-section">
          <h3>{copy.info}</h3>
          <div className="field-grid">
            <DetailRow label={copy.source} value={sourceLabel(item)} />
            <DetailRow label={copy.picked} value={formatDateTime(item.pickedAt)} />
            {post ? <PostInfoRows post={post} /> : null}
            {!page && !post ? <><DetailRow label={copy.format} value={item.mimeType ?? kindLabel(item.modality, language)} /><DetailRow label={copy.size} value={formatBytes(item.fileSize, language)} /></> : null}
            {storedFileState === "cached" && item.localPath ? <DetailActionRow label={copy.localLink} onClick={() => onRevealLocal(item)} title={copy.showInFolder} value={item.localPath} /> : null}
            {(storedFileState === "missing" || storedFileState === "failed") && webLink ? <DetailActionRow icon={<Download size={13} />} label={copy.localLink} onClick={() => onRetryDownload(item)} title={copy.downloadAgain} value={copy.downloadAgain} /> : null}
            {storedFileState === "downloading" ? <DetailRow label={copy.localLink} value={copy.downloading} /> : null}
            {webLink ? <DetailRow hideLinkIcon label={copy.webLink} link value={webLink} /> : null}
          </div>
          {item.modality === "image" && Boolean(item.contentUrl) && localState(item) === "pending" ? <div className="detail-source-actions"><button className="secondary-button" onClick={() => onRequestDownload(item)} type="button"><Download size={14} />{copy.downloadLocalFile}</button></div> : null}
        </section>
      </div>
      <footer className="inspector-footer"><div className="inspector-footer-actions">{confirmDelete ? <div className="inspector-footer-utility"><button className="text-button" onClick={() => setConfirmDelete(false)} type="button">{copy.cancel}</button><button className="danger-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} />{copy.confirmDelete}</button></div> : <><div className="inspector-footer-utility"><button className="danger-outline-button inspector-delete" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={15} />{copy.delete}</button><button className="secondary-button inspector-copy-button" onClick={() => void onCopy(item)} type="button"><Copy size={15} />{copyAction}</button></div><button className={`detail-footer-favorite ${item.favorite ? "active" : ""}`} aria-label={item.favorite ? copy.removeFavorite : copy.addFavorite} aria-pressed={item.favorite} onClick={() => void onFavorite(item.id, !item.favorite)} type="button"><Star size={15} fill={item.favorite ? "currentColor" : "none"} /></button></>}</div></footer>
    </aside>
  </div>;
}

function DetailRow({ hideLinkIcon = false, label, link = false, value }: { hideLinkIcon?: boolean; label: string; link?: boolean; value: string }) { return <div className="field"><span>{label}</span>{link ? <strong><a href={value} rel="noreferrer" target="_blank" title={value}>{value}{!hideLinkIcon ? <ExternalLink size={12} /> : null}</a></strong> : <strong title={value}>{value}</strong>}</div>; }
function DetailActionRow({ icon, label, onClick, title, value }: { icon?: React.ReactNode; label: string; onClick: () => void; title: string; value: string }) { return <div className="field"><span>{label}</span><button className="detail-path-action" data-tooltip={title} onClick={onClick} type="button"><span>{value}</span>{icon}</button></div>; }
function LocalFileDetailPreview({ item, onOpen }: { item: SourceItem; onOpen: () => void }) { return <button aria-label="Open file" className="detail-local-file-preview" onClick={onOpen} type="button"><FileIdentity item={item} /></button>; }
function WebPageDetailPreview({ item }: { item: SourceItem }) { const title = item.metadata.pageTitle || item.metadata.ogTitle || item.itemTitle; const hasThumbnail = Boolean(item.thumbnailUrl); return <button aria-label="Open link in browser" className={`webpage-detail-preview ${hasThumbnail ? "has-thumbnail" : ""}`} onClick={() => openWebLink(item)} type="button">{hasThumbnail ? <span className="webpage-artwork-large"><img src={item.thumbnailUrl ?? undefined} alt="" onError={(event) => { event.currentTarget.parentElement?.setAttribute("hidden", ""); event.currentTarget.closest(".webpage-detail-preview")?.classList.remove("has-thumbnail"); }} /></span> : null}<div className="webpage-detail-copy"><div className="webpage-site-line">{item.faviconUrl ? <img src={item.faviconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}<span>{sourceLabel(item)}</span></div><h3>{title}</h3>{item.metadata.description ? <p>{item.metadata.description}</p> : null}</div></button>; }
function WebVideoDetailPreview({ item }: { item: SourceItem }) {
  const copy = interfaceCopy[useLanguage()];
  const [coverSrc, setCoverSrc] = useState(item.thumbnailUrl || item.metadata.mediaPreviewUrl);
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverSrc(item.thumbnailUrl || item.metadata.mediaPreviewUrl); setCoverFailed(false); }, [item.id, item.thumbnailUrl, item.metadata.mediaPreviewUrl]);
  const handleCoverError = () => {
    const fallback = item.metadata.mediaPreviewUrl;
    if (fallback && fallback !== coverSrc) {
      setCoverSrc(fallback);
      return;
    }
    setCoverFailed(true);
  };
  return <button aria-label="Open link in browser" className="detail-media-preview detail-web-video-preview" onClick={() => openWebLink(item)} type="button">{coverSrc && !coverFailed ? <img src={coverSrc} alt={item.itemTitle} onError={handleCoverError} /> : <VideoFallbackArtwork compact={false} />}<span className="video-cover-label">{copy.cover}</span></button>;
}
function PostDetailPreview({ item, post }: { item: SourceItem; post: NonNullable<SourceItem["metadata"]["post"]> }) {
  const language = useLanguage();
  const labels = postLabels(language);
  const hasThumbnail = Boolean(item.thumbnailUrl);
  const platform = postPlatformFor(item);
  return <section aria-label={labels.openPost} className={`post-detail-preview ${hasThumbnail ? "has-thumbnail" : ""}`} onClick={() => openWebLink(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openWebLink(item); }} role="link" tabIndex={0}>
    {hasThumbnail ? <span className="post-detail-cover"><img src={item.thumbnailUrl ?? undefined} alt="" onError={(event) => { event.currentTarget.parentElement?.setAttribute("hidden", ""); event.currentTarget.closest(".post-detail-preview")?.classList.remove("has-thumbnail"); }} /></span> : null}
    <div className="post-detail-copy"><PostPlatformMark faviconUrl={item.faviconUrl} platform={platform} /><h3>{post.title || item.itemTitle}</h3><PostByline className="post-detail-meta" post={post} />{post.bodyText ? <p>{post.bodyText}</p> : null}{post.tags?.length ? <div className="post-detail-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</div>
  </section>;
}
function PostByline({ className, post }: { className: string; post: NonNullable<SourceItem["metadata"]["post"]> }) {
  const author = [post.author?.displayName, post.author?.handle].filter(Boolean).join(" · ");
  if (!author && !post.publishedAt) return null;
  return <div className={className}>{author ? <span>{author}</span> : null}{post.publishedAt ? <time>{formatDateTime(post.publishedAt)}</time> : null}</div>;
}
function PostPlatformMark({ faviconUrl, platform }: { faviconUrl: string | null; platform: "x" | "xiaohongshu" | undefined }) { const language = useLanguage(); const label = postPlatformLabel(platform, language); const logo = platform === "xiaohongshu" ? "/xiaohongshu-mark.svg" : faviconUrl; return <div className="post-platform-mark"><span className="post-platform-logo"><span aria-hidden="true">{platform === "xiaohongshu" ? "小" : "X"}</span>{logo ? <img src={logo} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span><span>{label}</span></div>; }
function PostInfoRows({ post }: { post: NonNullable<SourceItem["metadata"]["post"]> }) {
  const language = useLanguage();
  const labels = postLabels(language);
  const author = [post.author?.displayName, post.author?.handle].filter(Boolean).join(" · ");
  return <>{author ? <DetailRow label={labels.author} value={author} /> : null}{post.publishedAt ? <DetailRow label={labels.published} value={formatDateTime(post.publishedAt)} /> : null}{post.tags?.length ? <DetailRow label={labels.tags} value={post.tags.join(" ")} /> : null}</>;
}
function postLabels(language: Language) { return language === "zh" ? { author: "作者", published: "发布时间", tags: "标签", openPost: "打开原帖" } : { author: "Author", published: "Published", tags: "Tags", openPost: "Open original post" }; }
function postPlatformLabel(platform: "x" | "xiaohongshu" | undefined, language: Language) { if (platform === "xiaohongshu") return language === "zh" ? "小红书" : "Xiaohongshu"; return "X"; }
function SourcePreviewModal({ item, onClose }: { item: SourceItem | null; onClose: () => void }) {
  const copy = interfaceCopy[useLanguage()];
  if (!item || (!item.thumbnailUrl && !item.contentUrl)) return null;
  return <div className="media-preview-backdrop" role="dialog" aria-modal="true" aria-label={copy.mediaPreview} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><button className="media-preview-close" aria-label={copy.closePreview} data-tooltip={copy.closePreview} onClick={onClose} type="button"><X size={18} /></button>{item.modality === "video" ? <video autoPlay controls muted playsInline src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /> : item.modality === "audio" ? <section className="media-preview-audio"><strong>{item.itemTitle}</strong><audio autoPlay controls src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /></section> : <img src={item.thumbnailUrl ?? item.contentUrl ?? ""} alt={item.itemTitle} />}</div>;
}

function DownloadImageModal({ item, onClose, onConfirm }: { item: SourceItem | null; onClose: () => void; onConfirm: (item: SourceItem) => void }) {
  const copy = interfaceCopy[useLanguage()];
  if (!item) return null;
  const restoring = ["missing", "failed"].includes(localState(item));
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.downloadImage} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal"><header className="modal-head"><div><h2>{restoring ? copy.downloadAgain : copy.downloadImage + "?"}</h2><p>{item.itemTitle}</p></div><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body"><p>{restoring ? copy.missingDownloadMessage : copy.imageDownloadMessage}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" onClick={() => void onConfirm(item)} type="button"><Download size={15} />{copy.download}</button></footer></section></div>;
}

function DeleteModal({ count, isOpen, onClose, onConfirm }: { count: number; isOpen: boolean; onClose: () => void; onConfirm: () => void }) {
  const copy = interfaceCopy[useLanguage()];
  if (!isOpen || !count) return null;
  const title = useLanguage() === "en" ? "Delete " + count + " source" + (count === 1 ? "" : "s") + "?" : "删除 " + count + " 个素材？";
  const description = useLanguage() === "en" ? "This removes the selected sources and any local copies saved by Sourcebook." : "这会删除所选素材及由 Sourcebook 保存的本地副本。";
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.deleteSources} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal project-delete-modal"><header className="modal-head"><h2>{title}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><p className="project-delete-message">{description}</p><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="danger-button" onClick={onConfirm} type="button"><Trash2 size={15} />{copy.delete}</button></footer></section></div>;
}

function ClearLocalDataModal({ isClearing, isOpen, onClose, onConfirm }: { isClearing: boolean; isOpen: boolean; onClose: () => void; onConfirm: () => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language]; const [isFinalConfirm, setIsFinalConfirm] = useState(false);
  useEffect(() => { if (isOpen) setIsFinalConfirm(false); }, [isOpen]);
  if (!isOpen) return null;
  const title = language === "zh" ? (isFinalConfirm ? "确认清空所有数据？" : "清空本地数据？") : (isFinalConfirm ? "Permanently delete all data?" : "Clear local data?");
  const description = language === "zh" ? (isFinalConfirm ? "这会立即删除所有 Book、素材、备注和由 Sourcebook 保存的本地文件，且无法恢复。" : "建议先导出备份。下一步将要求你再次确认，清空操作不会影响已安装的浏览器插件。") : (isFinalConfirm ? "This immediately deletes every Book, source, note, and local file saved by Sourcebook. It cannot be undone." : "Export a backup first if you may need this library again. The next step asks for a final confirmation and does not remove the browser extension.");
  const action = language === "zh" ? (isFinalConfirm ? "清空所有数据" : "继续") : (isFinalConfirm ? "Delete all data" : "Continue");
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.clearLocalData} onMouseDown={(event) => event.target === event.currentTarget && !isClearing && onClose()}><section className="export-modal project-delete-modal"><header className="modal-head"><h2>{title}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} disabled={isClearing} onClick={onClose} type="button"><X size={16} /></button></header><p className="project-delete-message">{description}</p><footer className="modal-footer"><button className="text-button" disabled={isClearing} onClick={onClose} type="button">{copy.cancel}</button><button className="danger-button" disabled={isClearing} onClick={() => isFinalConfirm ? onConfirm() : setIsFinalConfirm(true)} type="button"><Trash2 size={15} />{isClearing ? copy.loading : action}</button></footer></section></div>;
}

function BackupExportModal({ books, isOpen, onClose, onExport, onSelectionChange, selectedBookIds }: { books: Book[]; isOpen: boolean; onClose: () => void; onExport: (bookIds: string[]) => void; onSelectionChange: (bookIds: string[]) => void; selectedBookIds: string[] }) {
  const copy = interfaceCopy[useLanguage()];
  if (!isOpen) return null;
  const selected = new Set(selectedBookIds);
  const allSelected = books.length > 0 && selectedBookIds.length === books.length;
  const toggleBook = (bookId: string) => onSelectionChange(selected.has(bookId) ? selectedBookIds.filter((id) => id !== bookId) : [...selectedBookIds, bookId]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal backup-export-modal" role="dialog" aria-modal="true" aria-label={copy.selectBooksToExport}><header className="modal-head"><div><h2>{copy.selectBooksToExport}</h2><p>{selectedBookIds.length} {copy.selectedBooks}</p></div><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="backup-export-body"><button className="text-button backup-select-all" onClick={() => onSelectionChange(allSelected ? [] : books.map((book) => book.id))} type="button">{allSelected ? copy.clearSelection : copy.selectAll}</button><div className="backup-book-list">{books.map((book) => <label className="backup-book-option" key={book.id}><input checked={selected.has(book.id)} onChange={() => toggleBook(book.id)} type="checkbox" /><span>{book.name}</span></label>)}</div></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!selectedBookIds.length} onClick={() => onExport(selectedBookIds)} type="button"><Download size={15} />{copy.exportSelectedBooks}</button></footer></section></div>;
}

function LocalDataManagerModal({ isOpen, language, onClear, onClose, onExport, onImport, onLoad, onMigrated, settings }: { isOpen: boolean; language: Language; onClear: () => void; onClose: () => void; onExport: () => void; onImport: () => void; onLoad: (value: LibrarySettingsResponse) => void; onMigrated: () => void; settings: LibrarySettingsResponse | null }) {
  const [current, setCurrent] = useState<LibrarySettingsResponse | null>(settings);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zh = language === "zh";
  useEffect(() => { if (!isOpen) return; void request<LibrarySettingsResponse>("/api/settings/library").then((value) => { setCurrent(value); onLoad(value); setDestination(value.libraryRoot); setError(""); }).catch((reason) => setError(errorMessage(reason))); }, [isOpen]);
  if (!isOpen) return null;
  const applyDestination = async (nextDestination: string) => { const previousRoot = current?.libraryRoot; const hasData = !current?.isEmpty; const value = await request<LibrarySettingsResponse>("/api/settings/library", { method: "PUT", body: JSON.stringify({ destination: nextDestination }) }); setCurrent(value); onLoad(value); setDestination(value.libraryRoot); if (hasData && previousRoot && previousRoot !== value.libraryRoot) onMigrated(); if (!value.requiresSetup) onClose(); };
  const choose = async () => { setBusy(true); setError(""); try { const value = await request<{ destination: string | null }>("/api/settings/library/choose", { method: "POST" }); if (!value.destination) return; setDestination(value.destination); await applyDestination(value.destination); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } };
  const reveal = async () => { try { await request("/api/settings/library/reveal", { method: "POST" }); } catch (reason) { setError(errorMessage(reason)); } };
  const isFirstRun = current?.isEmpty ?? false;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="local-data-manager-title"><section className="export-modal local-data-manager-modal"><header className="modal-head"><div><h2 id="local-data-manager-title">{isFirstRun ? (zh ? "选择素材库位置" : "Choose a library location") : (zh ? "管理本地数据" : "Manage local data")}</h2><p>{isFirstRun ? (zh ? "选择一个位置，开始保存你的 Book 和素材。" : "Choose where to save your Books and sources.") : (zh ? "数据只保存在你的设备上。" : "Your data stays on this device.")}</p></div><button aria-label={zh ? "关闭" : "Close"} className="icon-button" onClick={onClose} type="button"><X size={16} /></button></header><div className="local-data-manager-body"><section className="local-data-section"><div><h3>{isFirstRun ? (zh ? "保存位置" : "Save location") : (zh ? "素材库位置" : "Library location")}</h3><p>{isFirstRun ? (zh ? "之后可随时在设置中更换。" : "You can change this later in Settings.") : (zh ? "选择新位置后会自动迁移现有内容。" : "Choosing a new location moves your existing content.")}</p></div><div className="library-location-field"><input aria-label={zh ? "素材库位置" : "Library location"} readOnly value={destination} /><button className="secondary-button" disabled={busy} onClick={() => void choose()} type="button">{busy ? <LoaderCircle className="spin" size={15} /> : null}{zh ? "选择…" : "Choose…"}</button></div>{current?.configured ? <button className="text-button library-reveal-button" onClick={() => void reveal()} type="button"><ExternalLink size={14} />{zh ? "在文件夹中显示" : "Show in folder"}</button> : null}</section>{isFirstRun ? <section className="local-data-section"><div><h3>{zh ? "已有备份？" : "Already have a backup?"}</h3><p>{zh ? "从已有的 Sourcebook 备份继续。" : "Continue from an existing Sourcebook backup."}</p></div><div className="local-data-actions"><button className="secondary-button" onClick={onImport} type="button"><Upload size={15} />{zh ? "导入备份" : "Import backup"}</button></div></section> : <><section className="local-data-section"><div><h3>{zh ? "备份" : "Backup"}</h3><p>{zh ? "导出备份，或导入已有备份。" : "Export a backup or import an existing one."}</p></div><div className="local-data-actions"><button className="secondary-button" onClick={onExport} type="button"><Download size={15} />{zh ? "导出备份" : "Export backup"}</button><button className="secondary-button" onClick={onImport} type="button"><Upload size={15} />{zh ? "导入备份" : "Import backup"}</button></div></section><section className="local-data-section local-data-clear"><div><h3>{zh ? "删除本地数据" : "Clear local data"}</h3><p>{zh ? "永久删除所有本地 Book 和素材。" : "Permanently delete all local Books and sources."}</p></div><button className="secondary-button" onClick={onClear} type="button"><Trash2 size={15} />{zh ? "删除本地数据" : "Clear local data"}</button></section></>}{error ? <p className="settings-inline-error" role="alert">{error}</p> : null}</div></section></div>;
}

function UpdateSettingsModal({ isOpen, language, onClose, onLoad, settings }: { isOpen: boolean; language: Language; onClose: () => void; onLoad: (value: UpdateSettingsResponse) => void; settings: UpdateSettingsResponse | null }) {
  const [current, setCurrent] = useState<UpdateSettingsResponse | null>(settings);
  const [checking, setChecking] = useState(false);
  const zh = language === "zh";
  const refresh = async (force = false) => { setChecking(true); try { const value = await request<UpdateSettingsResponse>(`/api/settings/update${force ? "?check=1" : ""}`); setCurrent(value); onLoad(value); } finally { setChecking(false); } };
  useEffect(() => { if (isOpen) void refresh(false); }, [isOpen]);
  if (!isOpen) return null;
  const release = current?.release;
  const installedVersion = current?.version ?? "—";
  const installedBuild = current?.build?.trim();
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-settings-title"><section className="export-modal update-settings-modal"><header className="modal-head"><div><h2 id="update-settings-title">{zh ? "版本与更新" : "Version & updates"}</h2><p>{zh ? `当前版本 ${installedVersion}${installedBuild ? `（构建 ${installedBuild}）` : ""}` : `Installed version ${installedVersion}${installedBuild ? ` (Build ${installedBuild})` : ""}`}</p></div><button aria-label={zh ? "关闭" : "Close"} className="icon-button" onClick={onClose} type="button"><X size={16} /></button></header><div className="update-settings-body"><label className="update-toggle"><span><strong>{zh ? "自动检查更新" : "Check for updates automatically"}</strong><small>{zh ? "启动后静默检查，最多每 24 小时一次。" : "Check quietly after launch, at most once every 24 hours."}</small></span><input checked={current?.autoCheck ?? true} onChange={async (event) => { const value = await request<UpdateSettingsResponse>("/api/settings/update", { method: "PUT", body: JSON.stringify({ autoCheck: event.target.checked }) }); setCurrent(value); onLoad(value); }} type="checkbox" /></label>{release ? <section className="available-update"><span className="available-update-label">{zh ? "有新版本可用" : "Update available"}</span><h3>{release.name || release.version}</h3><p>{release.notes || (zh ? "查看 Release 页面了解此版本的更新内容。" : "See the Release page for what changed.")}</p><a className="primary-button" href={release.url} rel="noreferrer" target="_blank"><Download size={15} />{zh ? "下载更新" : "Download update"}</a></section> : <p className={current?.status === "error" ? "settings-inline-error" : "settings-muted"}>{current?.status === "error" ? current.error : (zh ? "已是最新版本。" : "You’re up to date.")}</p>}<p className="update-last-check">{current?.lastCheckedAt ? `${zh ? "上次检查" : "Last checked"}: ${formatDateTime(current.lastCheckedAt)}` : (zh ? "尚未检查更新。" : "No update check yet.")}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{zh ? "关闭" : "Close"}</button><button className="secondary-button" disabled={checking} onClick={() => void refresh(true)} type="button">{checking ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{zh ? "立即检查" : "Check now"}</button></footer></section></div>;
}

function agentInstallPrompt(target: AgentInstallTarget, zh: boolean, guideUrl?: string) {
  const guide = guideUrl || "https://github.com/Yanze-He/sourcebook-plugin/blob/main/INSTALL.md";
  const action = zh ? "安装或更新" : "Install or update";
  const agent = target === "workbuddy" ? "WorkBuddy" : "Codex";
  return zh ? `请按这份指南为 ${agent} ${action} Sourcebook Agent 插件：${guide}` : `${action} Sourcebook Agent Plugin for ${agent} using this guide: ${guide}`;
}

function MCPSettingsModal({ isOpen, language, onClose, onLoad, settings }: { isOpen: boolean; language: Language; onClose: () => void; onLoad: (value: MCPSettingsResponse) => void; settings: MCPSettingsResponse | null }) {
  const zh = language === "zh";
  const [current, setCurrent] = useState<MCPSettingsResponse | null>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<AgentInstallTarget>("codex");
  const [isTargetOpen, setIsTargetOpen] = useState(false);
  const [showVersionHelp, setShowVersionHelp] = useState(false);
  useEffect(() => { if (!isOpen) return; void request<MCPSettingsResponse>("/api/settings/mcp").then((value) => { setCurrent(value); onLoad(value); setMessage(""); }).catch((reason) => setMessage(errorMessage(reason))); }, [isOpen]);
  if (!isOpen) return null;
  const enable = async () => { setBusy(true); setMessage(""); try { const value = await request<MCPSettingsResponse>("/api/settings/mcp", { method: "POST", body: JSON.stringify({}) }); setCurrent(value); onLoad(value); } catch (reason) { setMessage(errorMessage(reason)); } finally { setBusy(false); } };
  const revoke = async () => { setBusy(true); setMessage(""); try { const value = await request<MCPSettingsResponse>("/api/settings/mcp", { method: "DELETE" }); setCurrent(value); onLoad(value); } catch (reason) { setMessage(errorMessage(reason)); } finally { setBusy(false); } };
  const installPrompt = agentInstallPrompt(target, zh, current?.guideUrl);
  const installAvailable = Boolean(current?.enabled && current?.serviceReady && current?.installReady);
  const installStatus = !current?.enabled ? (zh ? "先在上方批准本机 Agent 访问，才能生成安装提示。" : "Approve local-agent access above before generating an install prompt.") : !current?.serviceReady ? (zh ? "本机配对尚未准备好；请重新启用访问后再试。" : "Local pairing is not ready. Re-enable access and try again.") : null;
  const copyInstallPrompt = async () => { if (!installAvailable) return; try { await navigator.clipboard.writeText(installPrompt); setMessage(zh ? "安装提示词已复制，请将它粘贴到所选Agent对话框。" : "Install prompt copied. Paste it into a conversation with the selected Agent."); } catch (reason) { setMessage(errorMessage(reason)); } };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-settings-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="export-modal mcp-settings-modal">
      <header className="modal-head"><div><h2 id="mcp-settings-title">{zh ? "连接 Agent" : "Connect an Agent"}</h2><p>{zh ? "让本机 Agent 在你选择 Book 后安全使用资料。" : "Let a local Agent safely use sources after you choose a Book."}</p></div><button aria-label={zh ? "关闭" : "Close"} className="icon-button" onClick={onClose} type="button"><X size={16} /></button></header>
      <div className="mcp-settings-body">
        <section className="mcp-access-panel"><div><span className={`mcp-access-indicator ${current?.enabled ? "is-enabled" : ""}`} aria-hidden="true" /><strong>{current?.enabled ? (zh ? "本机访问已开启" : "Local access is on") : (zh ? "先开启本机访问" : "Turn on local access first")}</strong><p>{zh ? "Agent可以获取Book数据，对Book的改动可在Agent提交窗口中查看" : "Agents can access Book data. Review proposed Book changes in Agent submissions."}</p></div>{!current?.enabled ? <button className="primary-button" disabled={busy} onClick={() => void enable()} type="button">{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{zh ? "允许本机 Agent 访问" : "Allow local-agent access"}</button> : <button className="mcp-revoke-button" disabled={busy} onClick={() => void revoke()} type="button">{busy ? <LoaderCircle className="spin" size={14} /> : null}{zh ? "撤销访问" : "Revoke access"}</button>}</section>
        <section className="mcp-install-step">
          <div className="mcp-install-heading">
            <div className="mcp-install-title-row">
              <h3>{zh ? "安装 Agent 插件" : "Install Agent plugin"}</h3>
              {current?.agentVersion ? <div className="mcp-version-help" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShowVersionHelp(false); }}>
                <button aria-expanded={showVersionHelp} aria-label={zh ? "查看插件版本和更新说明" : "Plugin version and update help"} className="mcp-version-help-button" onClick={() => setShowVersionHelp((open) => !open)} type="button"><CircleHelp size={16} /></button>
                {showVersionHelp ? <div className="mcp-version-help-popover" role="status"><strong>{zh ? `Desktop 内置插件：${current.agentVersion}` : `Bundled with Desktop: ${current.agentVersion}`}</strong><span>{zh ? "独立插件可能有更新版本；再次发送安装提示即可检查并更新。" : "The independent plugin may be newer. Send the install request again to check and update."}</span></div> : null}
              </div> : null}
            </div>
            <p className="mcp-install-description">{zh ? "复制请求并发送给目标 Agent；它会检查 GitHub 上的插件版本。" : "Send the request to your Agent. It checks the plugin version on GitHub."}</p>
          </div>
          <div className="mcp-install-action">
            <div className="mcp-install-action-main">
              <div className="mcp-agent-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsTargetOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setIsTargetOpen(false); }}>
                <span>{zh ? "安装目标" : "Install target"}</span>
                <button aria-expanded={isTargetOpen} aria-haspopup="listbox" className={`mcp-agent-picker-button${isTargetOpen ? " is-open" : ""}`} onClick={() => setIsTargetOpen((open) => !open)} type="button"><span>{target === "workbuddy" ? "WorkBuddy" : "Codex"}</span><ChevronDown size={15} /></button>
                {isTargetOpen ? <div aria-label={zh ? "选择 Agent" : "Choose an Agent"} className="mcp-agent-picker-menu" role="listbox">{(["codex", "workbuddy"] as AgentInstallTarget[]).map((option) => <button aria-selected={target === option} key={option} onClick={() => { setTarget(option); setIsTargetOpen(false); setMessage(""); }} role="option" type="button">{option === "workbuddy" ? "WorkBuddy" : "Codex"}{target === option ? <Check aria-hidden="true" size={14} /> : null}</button>)}</div> : null}
              </div>
              <button className="primary-button" disabled={!installAvailable} onClick={() => void copyInstallPrompt()} type="button"><Copy size={15} />{zh ? "复制安装请求" : "Copy install request"}</button>
            </div>
            {message ? <p className="mcp-install-feedback" role="status"><Info aria-hidden="true" size={15} />{message}</p> : installStatus ? <p className="mcp-install-feedback"><Info aria-hidden="true" size={15} />{installStatus}</p> : null}
            <p className="mcp-future-agents">{zh ? "未来可能支持更多 Agent。" : "More Agents may be supported in the future."}</p>
          </div>
        </section>
      </div>
    </section>
  </div>;
}

function MCPSuggestionsModal({ isOpen, language, onClose, onConnectAgent, onLoad, onReview, suggestions }: { isOpen: boolean; language: Language; onClose: () => void; onConnectAgent: () => void; onLoad: (suggestions: MCPSuggestionEntry[]) => void; onReview: (bookId: string, suggestionId: string, decision: "accept" | "reject") => Promise<void>; suggestions: MCPSuggestionEntry[] }) {
  const zh = language === "zh";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"pending" | "processed">("pending");
  useEffect(() => { if (!isOpen) return; setView("pending"); setError(""); void request<MCPSuggestionsResponse>("/api/mcp/suggestions").then((response) => onLoad(response.suggestions || [])).catch((reason) => setError(errorMessage(reason))); }, [isOpen]);
  if (!isOpen) return null;
  const pending = suggestions.filter((entry) => entry.suggestion.status === "pending");
  const processed = suggestions.filter((entry) => entry.suggestion.status !== "pending");
  const visible = view === "pending" ? pending : processed;
  const review = async (entry: MCPSuggestionEntry, decision: "accept" | "reject") => { setBusy(entry.suggestion.id); setError(""); try { await onReview(entry.book.id, entry.suggestion.id, decision); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(null); } };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-suggestions-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="export-modal mcp-suggestions-modal">
      <header className="modal-head"><div><h2 id="mcp-suggestions-title">{zh ? "Agent 提交" : "Agent submissions"}</h2><p>{zh ? "查看 Agent 提交的内容，确认后才会写入 Book。" : "Review Agent submissions before they change a Book."}</p></div><div className="mcp-suggestions-header-actions"><button className="secondary-button" onClick={onConnectAgent} type="button"><Workflow aria-hidden="true" size={15} />{zh ? "连接 Agent" : "Connect an Agent"}</button><button aria-label={zh ? "关闭" : "Close"} className="icon-button" onClick={onClose} type="button"><X size={16} /></button></div></header>
      <div className="mcp-suggestion-tabs" role="tablist" aria-label={zh ? "提交状态" : "Submission status"}>
        <button aria-selected={view === "pending"} className={view === "pending" ? "is-active" : ""} onClick={() => setView("pending")} role="tab" type="button">{zh ? "待处理" : "Pending"}<span>{pending.length}</span></button>
        <button aria-selected={view === "processed"} className={view === "processed" ? "is-active" : ""} onClick={() => setView("processed")} role="tab" type="button">{zh ? "已处理" : "Processed"}<span>{processed.length}</span></button>
      </div>
      <div className="mcp-suggestions-list" role="tabpanel">
        {visible.length ? visible.map((entry) => <article className="mcp-suggestion" key={entry.suggestion.id}>
          <div className="mcp-suggestion-head"><div><strong>{suggestionTitle(entry.suggestion.kind, zh)}</strong><small>{entry.book.name} · {entry.suggestion.agentName} · {formatDateTime(entry.suggestion.createdAt)}</small></div><span className={`mcp-suggestion-status is-${entry.suggestion.status}`}>{suggestionStatus(entry.suggestion.status, zh)}</span></div>
          <SuggestionPreview entry={entry} zh={zh} />
          {entry.suggestion.reviewError ? <p className="mcp-suggestion-error">{entry.suggestion.reviewError}</p> : null}
          {entry.suggestion.status === "pending" ? <div className="mcp-suggestion-actions"><button className="text-button" disabled={busy === entry.suggestion.id} onClick={() => void review(entry, "reject")} type="button">{zh ? "拒绝" : "Reject"}</button><button className="primary-button" disabled={busy === entry.suggestion.id} onClick={() => void review(entry, "accept")} type="button">{busy === entry.suggestion.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{zh ? "接受" : "Accept"}</button></div> : null}
        </article>) : <p className="mcp-suggestions-empty">{view === "pending" ? (zh ? "没有待处理的提交。" : "No submissions need your review.") : (zh ? "暂无已处理提交。" : "No processed submissions yet.")}</p>}
        {error ? <p className="settings-inline-error" role="alert">{error}</p> : null}
      </div>
      <footer className="modal-footer"><button className="secondary-button" onClick={onClose} type="button">{zh ? "完成" : "Done"}</button></footer>
    </section>
  </div>;
}

function suggestionTitle(kind: MCPSuggestion["kind"], zh: boolean) { return ({ create_text_source: zh ? "新增文本素材" : "Create text source", import_local_file: zh ? "导入本地文件" : "Import local file", update_source_metadata: zh ? "更新素材信息" : "Update source metadata", pack: zh ? "创建 Pack" : "Create Pack" })[kind]; }
function suggestionStatus(status: MCPSuggestion["status"], zh: boolean) { return ({ pending: zh ? "待确认" : "Pending", accepted: zh ? "已接受" : "Accepted", rejected: zh ? "已拒绝" : "Rejected", stale: zh ? "无法应用" : "Could not apply" })[status]; }
function SuggestionPreview({ entry, zh }: { entry: MCPSuggestionEntry; zh: boolean }) {
  const { suggestion, book } = entry;
  const payload = suggestion.payload;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);
  if (suggestion.kind === "create_text_source") return <div className="mcp-suggestion-preview"><h3>{String(payload.title || (zh ? "未命名文本" : "Untitled text"))}</h3><div className="mcp-suggestion-markdown"><MarkdownContent compact value={String(payload.content || "")} /></div>{typeof payload.note === "string" && payload.note.trim() ? <div className="mcp-suggestion-note"><strong>{zh ? "备注" : "Note"}</strong><MarkdownContent compact value={payload.note} /></div> : null}</div>;
  if (suggestion.kind === "import_local_file") {
    const path = typeof payload.path === "string" ? payload.path : "";
    const name = path.split(/[\\/]/).filter(Boolean).pop() || (zh ? "本地文件" : "Local file");
    const mediaKind = /\.(?:png|jpe?g|webp|gif)$/i.test(name) ? "image" : /\.(?:mp4|mov|webm)$/i.test(name) ? "video" : /\.(?:mp3|wav|m4a|aac|flac|ogg)$/i.test(name) ? "audio" : null;
    const mediaUrl = `/api/mcp/suggestions/${encodeURIComponent(book.id)}/${encodeURIComponent(suggestion.id)}/preview`;
    return <>
      <div className="mcp-suggestion-file"><div className="mcp-suggestion-file-icon">{mediaKind === "image" ? <Image size={22} /> : mediaKind === "video" ? <Video size={22} /> : mediaKind === "audio" ? <Music2 size={22} /> : <FileUp size={22} />}</div><div className="mcp-suggestion-file-details"><strong title={name}>{name}</strong><small title={path}>{path}</small></div>{mediaKind ? <SuggestionMediaThumbnail kind={mediaKind} name={name} onOpen={() => setExpanded(true)} url={mediaUrl} zh={zh} /> : null}</div>
      {typeof payload.note === "string" && payload.note.trim() ? <div className="mcp-suggestion-note"><strong>{zh ? "备注" : "Note"}</strong><MarkdownContent compact value={payload.note} /></div> : null}
      {expanded && mediaKind ? createPortal(<div aria-label={zh ? "Agent 提交媒体预览" : "Agent submission media preview"} aria-modal="true" className="media-preview-backdrop mcp-media-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setExpanded(false)} role="dialog"><button aria-label={zh ? "关闭预览" : "Close preview"} className="media-preview-close" onClick={() => setExpanded(false)} type="button"><X size={18} /></button>{mediaKind === "image" ? <img alt={name} src={mediaUrl} /> : mediaKind === "video" ? <video autoPlay controls playsInline preload="metadata" src={mediaUrl} /> : <section className="media-preview-audio"><strong>{name}</strong><audio autoPlay controls src={mediaUrl} /></section>}</div>, document.body) : null}
    </>;
  }
  if (suggestion.kind === "update_source_metadata") {
    const changes = payload.changes && typeof payload.changes === "object" ? payload.changes as Record<string, unknown> : {};
    const base = payload.base && typeof payload.base === "object" ? payload.base as Record<string, unknown> : {};
    const labels: Record<string, string> = { title: zh ? "标题" : "Title", note: zh ? "备注" : "Note", favorite: zh ? "收藏" : "Favorite" };
    const labelValue = (value: unknown) => typeof value === "boolean" ? (value ? (zh ? "是" : "Yes") : (zh ? "否" : "No")) : String(value ?? "—");
    return <div className="mcp-suggestion-preview"><h3>{String(base.title || (zh ? "现有素材" : "Existing source"))}</h3><dl className="mcp-suggestion-changes">{Object.entries(changes).filter(([key]) => key in labels).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd><span>{labelValue(base[key])}</span><span aria-hidden="true">→</span><strong>{labelValue(value)}</strong></dd></div>)}</dl></div>;
  }
  return <div className="mcp-suggestion-preview"><h3>{String(payload.name || "Sourcebook Pack")}</h3>{typeof payload.prompt === "string" ? <div className="mcp-suggestion-markdown"><MarkdownContent compact value={payload.prompt} /></div> : null}</div>;
}

function SuggestionMediaThumbnail({ kind, name, onOpen, url, zh }: { kind: "image" | "video" | "audio"; name: string; onOpen: () => void; url: string; zh: boolean }) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => setUnavailable(false), [url]);
  if (unavailable) return <span className="mcp-suggestion-image-unavailable">{zh ? "预览不可用" : "Preview unavailable"}</span>;
  return <button aria-label={kind === "image" ? (zh ? `放大查看 ${name}` : `Enlarge ${name}`) : (zh ? `播放 ${name}` : `Play ${name}`)} className={`mcp-suggestion-media-button is-${kind}`} onClick={onOpen} type="button">{kind === "image" ? <img alt={zh ? `${name} 的缩略图` : `Thumbnail of ${name}`} loading="lazy" onError={() => setUnavailable(true)} src={url} /> : kind === "video" ? <><video aria-hidden="true" muted onError={() => setUnavailable(true)} playsInline preload="metadata" src={url} /><Play aria-hidden="true" className="mcp-suggestion-play-icon" size={20} /></> : <><Music2 aria-hidden="true" size={20} /><Play aria-hidden="true" size={12} /></>}</button>;
}

function PromptSettingsModal({ isOpen, language, savedTemplate, onClose, onSave }: { isOpen: boolean; language: Language; savedTemplate: string; onClose: () => void; onSave: (template: string) => void }) {
  const [template, setTemplate] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const copy = language === "zh" ? {
    title: "提示词设置", description: "用于“发送给 Agent > 复制提示词”。支持受控的循环和字段语法。", template: "提示词模板", restore: "恢复默认", cancel: "取消", save: "保存提示词", preview: "查看效果", previewTitle: "提示词效果", previewDescription: "使用虚构素材渲染，不会读取、发送或保存你的数据。", syntax: "模板语法", blocks: "循环区块", fields: "循环内字段", context: "本次选择信息", example: "示例", invalid: "请先修复模板语法：",
  } : {
    title: "Prompt settings", description: "Used by Pack for agent > Copy prompt. Supports controlled loops and fields.", template: "Prompt template", restore: "Restore default", cancel: "Cancel", save: "Save prompt", preview: "View result", previewTitle: "Prompt result", previewDescription: "Rendered with fictional sources. Nothing is read, sent, or saved.", syntax: "Template syntax", blocks: "Loop blocks", fields: "Fields inside a loop", context: "Current selection", example: "Example", invalid: "Fix the template before saving:",
  };
  const insertions = promptTemplateInsertions(language);
  useEffect(() => { if (isOpen) { setTemplate(normalizePromptTemplate(savedTemplate || defaultPromptTemplate(language), language)); setIsPreviewOpen(false); } }, [isOpen, language, savedTemplate]);
  if (!isOpen) return null;
  const errors = validatePromptTemplate(template);
  const insert = (entry: PromptTemplateInsertion) => {
    const editor = editorRef.current;
    if (!editor) { setTemplate((current) => current + entry.value); return; }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = template.slice(0, start) + entry.value + template.slice(end);
    setTemplate(next);
    const cursor = start + (entry.cursorOffset ?? entry.value.length);
    window.requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(cursor, cursor); });
  };
  const insertionGroup = (title: string, entries: ReturnType<typeof promptTemplateInsertions>) => <section className="prompt-setting-token-group"><h3>{title}</h3><div>{entries.map((entry) => <button key={entry.label} onClick={() => insert(entry)} type="button"><strong>{entry.label}</strong><code>{entry.syntax ?? entry.value}</code><small><span>{entry.description}</span><span>{copy.example}: {entry.example}</span></small></button>)}</div></section>;
  const preview = renderPromptTemplateContext(template, samplePromptTemplateContext(language));
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-settings-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal prompt-settings-modal"><header className="modal-head"><div><h2 id="prompt-settings-title">{copy.title}</h2><p>{copy.description}</p></div><button aria-label={copy.cancel} className="icon-button" data-tooltip={copy.cancel} onClick={onClose} type="button"><X size={16} /></button></header><div className="prompt-settings-body"><section className="prompt-setting-editor"><div className="prompt-settings-section-head"><label htmlFor="prompt-template-editor">{copy.template}</label><button className="text-button" onClick={() => setTemplate(defaultPromptTemplate(language))} type="button">{copy.restore}</button></div><textarea id="prompt-template-editor" ref={editorRef} spellCheck={false} value={template} onChange={(event) => setTemplate(event.target.value)} />{errors.length ? <p className="prompt-template-error" role="alert"><strong>{copy.invalid}</strong>{errors.join(" ")}</p> : null}</section><aside className="prompt-setting-insertions"><section className="prompt-template-syntax"><h3>{copy.syntax}</h3><p>{language === "zh" ? "使用 {{字段}} 输出值；用 {{#files}}、{{#links}} 控制分组；用 {{#each files}} 或 {{#each links}} 遍历每条素材。" : "Use {{field}} for values, {{#files}} or {{#links}} for conditional sections, and {{#each files}} or {{#each links}} to iterate each source."}</p></section>{insertionGroup(copy.blocks, insertions.filter((entry) => entry.group === "block"))}{insertionGroup(copy.fields, insertions.filter((entry) => entry.group === "item"))}{insertionGroup(copy.context, insertions.filter((entry) => entry.group === "context"))}</aside></div><footer className="modal-footer"><button className="text-button" disabled={errors.length > 0} onClick={() => setIsPreviewOpen(true)} type="button"><Eye size={15} />{copy.preview}</button><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!template.trim() || errors.length > 0} onClick={() => onSave(template)} type="button"><Check size={15} />{copy.save}</button></footer>{isPreviewOpen ? <section aria-label={copy.previewTitle} className="prompt-template-preview" role="dialog"><header className="modal-head"><div><h2>{copy.previewTitle}</h2><p>{copy.previewDescription}</p></div><button aria-label={copy.cancel} className="icon-button" data-tooltip={copy.cancel} onClick={() => setIsPreviewOpen(false)} type="button"><X size={16} /></button></header><pre>{preview || "—"}</pre><footer className="modal-footer"><button className="primary-button" onClick={() => setIsPreviewOpen(false)} type="button">{copy.cancel}</button></footer></section> : null}</section></div>;
}

function CreateBookModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const [name, setName] = useState("");
  useEffect(() => { if (isOpen) setName(""); }, [isOpen]);
  if (!isOpen) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal" role="dialog" aria-modal="true" aria-label={copy.newBook}><header className="modal-head"><h2>{copy.newBook}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body"><label>{copy.bookName}<input autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) onCreate(name); }} placeholder={useLanguage() === "en" ? "For example, Brand references" : "例如：品牌参考"} value={name} /></label><p>{useLanguage() === "en" ? "Sources and local files stay separate from your other Books." : "素材和本地文件将与其他 Book 保持独立。"}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!name.trim()} onClick={() => onCreate(name)} type="button"><Plus size={15} />{copy.createBook}</button></footer></section></div>;
}

function CreateTextModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (title: string, content: string) => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language]; const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  useEffect(() => { if (isOpen) { setTitle(""); setContent(""); } }, [isOpen]);
  if (!isOpen) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal add-text-modal" role="dialog" aria-modal="true" aria-label={copy.addText}><header className="modal-head"><h2>{copy.addText}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="add-text-body"><label>{copy.textTitle}<input onChange={(event) => setTitle(event.target.value)} placeholder={language === "zh" ? "给这条记录起个名字（可留空）" : "Give this record a name (optional)"} value={title} /></label><label>{copy.textContent}<textarea autoFocus onChange={(event) => setContent(event.target.value)} placeholder={language === "zh" ? "写下一句灵感、一个念头、一段文字，或任何想留住的内容…" : "Write an idea, a thought, a passage, or anything you want to keep…"} value={content} /></label></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!content.trim()} onClick={() => onCreate(title, content)} type="button"><FileText size={15} />{copy.createText}</button></footer></section></div>;
}

function RenameBookModal({ book, canDelete, onClose, onDelete, onRename }: { book: Book | null; canDelete: boolean; onClose: () => void; onDelete: () => void; onRename: (bookId: string, name: string) => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language]; const [name, setName] = useState(book?.name ?? "");
  useEffect(() => { setName(book?.name ?? ""); }, [book]);
  if (!book) return null;
  const valid = Boolean(name.trim()) && name.trim() !== book.name;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal" role="dialog" aria-modal="true" aria-label={copy.bookSetting}><header className="modal-head"><h2>{copy.bookSetting}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body"><label>{copy.bookName}<input autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && valid) onRename(book.id, name); }} value={name} /></label><p>{language === "en" ? "Renaming keeps this Book's sources and local files unchanged." : "重命名不会改变此 Book 的素材和本地文件。"}</p></div><footer className="modal-footer book-setting-footer"><button className="danger-outline-button" disabled={!canDelete} onClick={onDelete} type="button"><Trash2 size={15} />{copy.delete}</button><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!valid} onClick={() => onRename(book.id, name)} type="button"><Check size={15} />{copy.save}</button></footer></section></div>;
}

function DeleteBookModal({ book, onClose, onConfirm }: { book: Book | null; onClose: () => void; onConfirm: (bookId: string) => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language];
  if (!book) return null;
  const description = language === "en" ? "Delete “" + book.name + "” and all of its sources and local files?" : "删除“" + book.name + "”及其中全部素材和本地文件？";
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal" role="dialog" aria-modal="true" aria-label={copy.deleteBook}><header className="modal-head"><h2>{copy.deleteBook + "?"}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body"><p>{description}</p><p>{language === "en" ? "Its Book folder will be moved to Sourcebook Trash." : "其 Book 文件夹会被移入 Sourcebook 废纸篓。"}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="danger-button" onClick={() => onConfirm(book.id)} type="button"><Trash2 size={15} />{copy.deleteBook}</button></footer></section></div>;
}

function TransferModal({ books, item, onClose, onTransfer }: { books: Book[]; item: SourceItem | null; onClose: () => void; onTransfer: (bookId: string, mode: "copy" | "move") => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language]; const [targetBookId, setTargetBookId] = useState("");
  useEffect(() => { setTargetBookId(books[0]?.id ?? ""); }, [item?.id, books]);
  if (!item) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal" role="dialog" aria-modal="true" aria-label={copy.moveTo}><header className="modal-head"><div><h2>{copy.moveTo}</h2><p>{item.itemTitle}</p></div><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body">{books.length ? <label>{copy.targetBook}<select onChange={(event) => setTargetBookId(event.target.value)} value={targetBookId}>{books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label> : <p>{language === "en" ? "Create another Book before moving this source." : "请先创建另一个 Book，再移动此素材。"}</p>}<p>{language === "en" ? "Copy keeps the original. Move transfers this source and its local file after the target is saved." : "复制会保留原素材；移动会在目标保存成功后转移素材和本地文件。"}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="secondary-button" disabled={!targetBookId} onClick={() => onTransfer(targetBookId, "copy")} type="button"><Copy size={15} />{copy.copyHere}</button><button className="primary-button" disabled={!targetBookId} onClick={() => onTransfer(targetBookId, "move")} type="button"><ArrowRightLeft size={15} />{copy.moveHere}</button></footer></section></div>;
}

function BatchNoteModal({ count, isOpen, onClose, onConfirm }: { count: number; isOpen: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language]; const [note, setNote] = useState("");
  useEffect(() => { if (isOpen) setNote(""); }, [isOpen]);
  if (!isOpen || !count) return null;
  const summary = language === "en" ? "Append context to " + count + " selected source" + (count === 1 ? "." : "s.") : "为已选的 " + count + " 个素材追加上下文。";
  const detail = language === "en" ? "Existing notes are kept. This note is appended as entered." : "会保留已有备注，并按输入内容直接追加。";
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.addNote} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal batch-note-modal"><header className="modal-head"><div><h2>{copy.addNote}</h2><p>{summary}</p></div><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="batch-note-body"><label htmlFor="batch-note">{copy.note}</label><textarea autoFocus id="batch-note" onChange={(event) => setNote(event.target.value)} placeholder={copy.addContext} value={note} /><p>{detail}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!note.trim()} onClick={() => onConfirm(note)} type="button"><MessageSquare size={15} />{copy.addNote}</button></footer></section></div>;
}

function PackPopover({ items, language, onClose, onCopyMaterials, onCopyPrompt }: { items: SourceItem[]; language: Language; onClose: () => void; onCopyMaterials: () => Promise<boolean>; onCopyPrompt: () => Promise<void> }) {
  const copyableFiles = items.filter(hasCopyablePackFile).length;
  const linkReferences = items.filter((item) => !hasCopyablePackFile(item) && Boolean(webLinkFor(item))).length;
  const copy = language === "zh" ? {
    title: "复制到剪贴板",
    subtitle: copyableFiles ? "先复制文件并粘贴到 Agent，再复制提示词并粘贴。" : "复制提示词后粘贴到 Agent 对话中。",
    materials: "复制文件",
    prompt: "复制提示词",
    localFiles: "个文件可直接粘贴。",
    linkReferences: "个没有本地文件的素材会作为链接写入提示词。",
  } : {
    title: "Copy to Clipboard",
    subtitle: copyableFiles ? "Paste copied files into your agent, then paste the copied prompt." : "Paste the copied prompt into your agent chat.",
    materials: "Copy files",
    prompt: "Copy prompt",
    localFiles: ` file${copyableFiles === 1 ? "" : "s"} can be pasted directly.`,
    linkReferences: ` source${linkReferences === 1 ? "" : "s"} without a local file will be included as links in the prompt.`,
  };
  return <div className="pack-popover" role="dialog" aria-label={language === "zh" ? "发送给 Agent" : "Pack for agent"}>
    <button aria-label={language === "zh" ? "关闭" : "Close"} className="pack-popover-close icon-button" data-tooltip={language === "zh" ? "关闭" : "Close"} onClick={onClose} type="button"><X size={14} /></button>
    <div className="pack-popover-header"><h2>{copy.title}</h2><p>{copy.subtitle}</p></div>
    <ul className="pack-popover-summary"><li><strong>{copyableFiles}</strong>{copy.localFiles}</li><li><strong>{linkReferences}</strong>{copy.linkReferences}</li></ul>
    <div className="pack-popover-actions pack-sequence-actions">
      <button className="primary-button" disabled={copyableFiles === 0} onClick={() => void onCopyMaterials()} type="button"><span aria-hidden="true" className="pack-step-number">1</span>{copy.materials}</button>
      <span aria-hidden="true" className="pack-step-connector" />
      <button className="primary-button" onClick={() => void onCopyPrompt()} type="button"><span aria-hidden="true" className="pack-step-number">2</span>{copy.prompt}</button>
    </div>
  </div>;
}

function BookTransferPopover({ books, count, isTransferring, onClose, onTransfer }: { books: Book[]; count: number; isTransferring: boolean; onClose: () => void; onTransfer: (bookId: string, mode: "copy" | "move") => void }) {
  const language = useLanguage();
  const [targetBookId, setTargetBookId] = useState("");
  useEffect(() => { setTargetBookId(books[0]?.id ?? ""); }, [books]);
  const copy = language === "zh" ? {
    title: "添加到其他 Book",
    summary: `选择要接收这 ${count} 个素材的 Book。`,
    empty: "请先创建另一个 Book，再转移素材。",
    move: "移动",
    copy: "复制",
    close: "关闭",
  } : {
    title: "Add to another Book",
    summary: `Choose a Book for ${count} selected source${count === 1 ? "" : "s"}.`,
    empty: "Create another Book before transferring sources.",
    move: "Move",
    copy: "Copy",
    close: "Close",
  };
  return <div className="pack-popover book-transfer-popover" role="dialog" aria-label={copy.title} aria-busy={isTransferring}>
    <button aria-label={copy.close} className="pack-popover-close icon-button" data-tooltip={copy.close} disabled={isTransferring} onClick={onClose} type="button"><X size={14} /></button>
    <div className="pack-popover-header"><h2>{copy.title}</h2><p>{copy.summary}</p></div>
    {books.length ? <div className="book-transfer-options" role="listbox" aria-label={copy.title}>{books.map((book) => <button aria-selected={targetBookId === book.id} className={targetBookId === book.id ? "is-selected" : ""} disabled={isTransferring} key={book.id} onClick={() => setTargetBookId(book.id)} role="option" type="button"><span>{book.name}</span>{targetBookId === book.id ? <Check size={14} /> : null}</button>)}</div> : <p className="book-transfer-empty">{copy.empty}</p>}
    <div className="pack-popover-actions book-transfer-actions"><button className="primary-button" disabled={!targetBookId || isTransferring} onClick={() => onTransfer(targetBookId, "move")} type="button">{isTransferring ? <LoaderCircle className="spin" size={14} /> : <ArrowRightLeft size={14} />}{copy.move}</button><button className="secondary-button" disabled={!targetBookId || isTransferring} onClick={() => onTransfer(targetBookId, "copy")} type="button"><Copy size={14} />{copy.copy}</button></div>
  </div>;
}

function PackModal({ items, isOpen, language, onClose }: { items: SourceItem[]; isOpen: boolean; language: Language; onClose: () => void }) {
  const [promptLanguage, setPromptLanguage] = useState<Language>(language);
  const templates = useMemo(() => packTemplates(promptLanguage), [promptLanguage]);
  const [templateId, setTemplateId] = useState<TemplateId>("none");
  const [values, setValues] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [isPromptEdited, setIsPromptEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SourcePack | null>(null);
  const [message, setMessage] = useState("");
  const template = templates.find((entry) => entry.id === templateId) ?? templates[0];
  const en = language === "en";
  const promptEn = promptLanguage === "en";
  const copy = (english: string, chinese: string) => en ? english : chinese;
  const promptCopy = (english: string, chinese: string) => promptEn ? english : chinese;
  useEffect(() => {
    if (!isOpen) return;
    const initial = packTemplates(language)[0];
    setPromptLanguage(language); setTemplateId("none"); setValues({}); setPrompt(buildPackPrompt(initial, {}, items, language)); setIsPromptEdited(false); setResult(null); setMessage("");
  }, [isOpen, items.length, language]);
  useEffect(() => {
    const initial = templates.find((entry) => entry.id === templateId) ?? templates[0];
    const nextValues = { ...initial.defaults };
    setValues(nextValues);
    if (!isPromptEdited) setPrompt(buildPackPrompt(initial, nextValues, items, promptLanguage));
  }, [promptLanguage]);
  if (!isOpen) return null;
  const selectTemplate = (next: TemplateId) => { const selected = templates.find((entry) => entry.id === next) ?? templates[0]; const nextValues = { ...selected.defaults }; setTemplateId(next); setValues(nextValues); setPrompt(buildPackPrompt(selected, nextValues, items, promptLanguage)); setIsPromptEdited(false); };
  const updateValue = (key: string, value: string) => { const nextValues = { ...values, [key]: value }; setValues(nextValues); if (!isPromptEdited) setPrompt(buildPackPrompt(template, nextValues, items, promptLanguage)); };
  const restorePrompt = () => { setPrompt(buildPackPrompt(template, values, items, promptLanguage)); setIsPromptEdited(false); };
  const generate = async () => { setBusy(true); try { const response = await request<{ sourcePack: SourcePack }>(bookPath("/api/source-packs", items[0]?.bookId), { method: "POST", body: JSON.stringify({ sourceItemIds: items.map((item) => item.id), name: "Sourcebook " + template.title + " Pack", prompt }) }); setResult(response.sourcePack); setMessage(response.sourcePack.warnings.length ? copy("Instructions are ready. " + response.sourcePack.warnings.length + " linked sources are included as URLs.", "提示词已生成，其中 " + response.sourcePack.warnings.length + " 个链接素材将以 URL 形式提供。") : copy("Instructions are ready to copy.", "提示词已生成，可以复制。")); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); } };
  const copyPrompt = async () => { await navigator.clipboard.writeText(prompt); setMessage(copy("Instructions copied.", "提示词已复制。")); };
  const icon = (id: TemplateId) => id === "none" ? <FileText size={18} /> : id === "continue-agent" ? <Workflow size={18} /> : id === "build-app-site" ? <Package size={18} /> : id === "promo-video" ? <Video size={18} /> : <Sparkles size={18} />;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pack-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal export-template-modal"><header className="modal-head"><div><h2 id="pack-title">{copy("Pack for an agent", "发送给 Agent")}</h2><p>{copy("Choose a work template, then carry the selected context to the next agent.", "选择工作模板，再把已选上下文带到下一个 Agent。")}</p></div><button aria-label={copy("Close", "关闭")} className="icon-button" data-tooltip={copy("Close", "关闭")} onClick={onClose} type="button"><X size={16} /></button></header><div className="modal-body export-template-layout"><aside className="export-template-sidebar"><section className="export-scope-panel" aria-label={copy("Selected sources summary", "已选素材摘要")}><div className="export-summary"><span><small>{copy("Scope", "范围")}</small><strong>{copy("Selected sources", "已选素材")}</strong></span><span><small>{copy("Sources", "素材")}</small><strong>{items.length}</strong></span><span><small>{copy("Local files", "本地附件")}</small><strong>{items.filter((item) => item.assetCacheState === "cached").length}</strong></span><span><small>{copy("Links", "链接")}</small><strong>{items.filter((item) => Boolean(webLinkFor(item))).length}</strong></span></div></section><section className="export-template-panel"><h3>{copy("Choose a use case", "选择工作模板")}</h3><div className="export-template-cards" role="list">{templates.map((entry) => <button aria-pressed={templateId === entry.id} className="export-template-card" disabled={Boolean(result)} key={entry.id} onClick={() => selectTemplate(entry.id)} type="button"><span className="export-template-icon">{icon(entry.id)}</span><span><strong>{entry.title}</strong><small>{entry.description}</small></span>{templateId === entry.id ? <Check size={16} /> : null}</button>)}</div></section></aside><main className="export-template-content"><section className="export-parameters-panel"><div className="export-template-heading"><h3>{copy("Details", "详细信息")}</h3></div>{template.fields.length ? <div className="export-template-fields">{template.fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.type === "select" ? <select disabled={Boolean(result)} value={values[field.key] ?? ""} onChange={(event) => updateValue(field.key, event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea disabled={Boolean(result)} placeholder={field.placeholder} rows={2} value={values[field.key] ?? ""} onChange={(event) => updateValue(field.key, event.target.value)} /> : <input disabled={Boolean(result)} placeholder={field.placeholder} value={values[field.key] ?? ""} onChange={(event) => updateValue(field.key, event.target.value)} />}</label>)}</div> : <p className="export-template-empty">{copy("Add any instructions for the agent below.", "可在下方补充给 Agent 的要求。")}</p>}</section><section className="export-prompt-panel"><div className="export-template-heading"><div><h3>{copy("Prompt preview", "提示词预览")}</h3><div className="prompt-language-switch" role="group" aria-label={copy("Prompt language", "提示词语言")}><button aria-pressed={promptLanguage === "en"} onClick={() => setPromptLanguage("en")} type="button">EN</button><button aria-pressed={promptLanguage === "zh"} onClick={() => setPromptLanguage("zh")} type="button">中文</button></div></div>{!result ? <button className="text-button" onClick={restorePrompt} type="button">{copy("Restore", "恢复模板")}</button> : null}</div><textarea className="export-prompt-editor" onChange={(event) => { setPrompt(event.target.value); setIsPromptEdited(true); }} placeholder={promptCopy("Add a task, background, constraints, or expected result…", "补充任务、背景、约束或预期结果…")} readOnly={Boolean(result)} value={prompt} /></section><footer className="export-action-bar">{message ? <p role="status">{message}</p> : null}<div className="export-action-buttons">{result ? <button className="primary-button" onClick={() => void copyPrompt()} type="button"><Copy size={15} />{copy("Copy instructions", "复制提示词")}</button> : null}<button className="text-button" onClick={onClose} type="button">{result ? copy("Done", "完成") : copy("Cancel", "取消")}</button>{!result ? <button className="primary-button" disabled={busy || !prompt.trim() || !items.length} onClick={() => void generate()} type="button">{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{busy ? copy("Preparing", "准备中") : copy("Prepare instructions", "生成提示词")}</button> : null}</div></footer></main></div></section></div>;
}

void PackModal;

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: React.ReactNode }) { return <div className="empty-panel public-empty-panel">{icon}<strong>{title}</strong><span>{description}</span></div>; }
function descriptionFor(item: SourceItem) { if (item.modality === "image" || item.modality === "video") return ""; return (item.resourceSummary || item.metadata.description || item.contentText || item.userNote || "").replace(/\s+/g, " ").trim().slice(0, 360); }
function sourceLabel(item: SourceItem) { if (item.modality === "post") return sourceHost(item.sourceUrl) || "Browser"; return item.metadata.siteName || item.sourceTitle || item.sourceOrigin || "Browser"; }
function sourceHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }
function postPlatformFor(item: SourceItem): "x" | "xiaohongshu" | undefined { const hostname = sourceHost(item.sourceUrl); if (/(^|\.)xiaohongshu\.com$/i.test(hostname)) return "xiaohongshu"; if (/(^|\.)(x|twitter)\.com$/i.test(hostname)) return "x"; return undefined; }
function formatDate(value: string) { return formatStandardDate(value); }
function formatDateTime(value: string) { return formatStandardDate(value, true); }
function formatStandardDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return includeTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}
function formatBytes(value: number | null, language: Language = "en") { if (!value) return interfaceCopy[language].notSavedLocally; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
function formatDuration(value: number) { const seconds = Math.max(0, Math.round(value)); const minutes = Math.floor(seconds / 60); return `${minutes}:${String(seconds % 60).padStart(2, "0")}`; }
function fileFormat(mimeType: string | null) { return mimeType?.split("/").at(-1)?.toLowerCase() || "file"; }
function sourceFormat(item: SourceItem) { const name = item.fileName ?? item.contentUrl ?? item.sourceUrl; const extension = /\.([a-z0-9]{2,8})(?:[?#]|$)/i.exec(name)?.[1]; if (extension) return extension.toUpperCase(); const mime = fileFormat(item.mimeType); return mime === "*" ? item.modality === "audio" ? "AUDIO" : "FILE" : mime.toUpperCase(); }
function localState(item: SourceItem): LocalFilter { if (item.modality === "text" || item.modality === "conversation") return "all"; if (item.assetCacheState === "downloading") return "downloading"; if (item.assetCacheState === "cached") return item.fileSize === null ? "missing" : "local"; if (item.assetCacheState === "missing" || item.status === "missing") return "missing"; if (item.assetCacheState === "failed" || item.status === "failed") return "failed"; return "pending"; }
function localFileState(item: SourceItem): LocalCopyState { if (!item.assetId) return null; if (item.assetCacheState === "cached" && item.fileSize === null) return "missing"; return item.assetCacheState; }
function webLinkFor(item: SourceItem) { return /^https?:\/\//i.test(item.sourceUrl) ? item.sourceUrl : null; }
function openWebLink(item: SourceItem) { const link = webLinkFor(item); if (link) window.open(link, "_blank", "noopener,noreferrer"); }
type PromptTemplateGroup = "block" | "item" | "context";
type PromptTemplateInsertion = { group: PromptTemplateGroup; label: string; value: string; description: string; example: string; syntax?: string; cursorOffset?: number };
type PromptTemplateItem = { index: string; title: string; file_name: string; url: string; type: string; note: string };
type PromptTemplateContext = { book_name: string; source_count: string; local_file_count: string; link_count: string; files: PromptTemplateItem[]; links: PromptTemplateItem[] };

function defaultPromptTemplate(language: Language) {
  return language === "zh" ? `请将上传的文件、以下链接及其备注作为任务上下文。

{{#files}}
## 上传的文件

{{#each files}}
{{index}}. \`{{file_name}}\`
   - 备注：{{note}}
{{/each}}
{{/files}}

{{#links}}
## 链接

{{#each links}}
{{index}}. {{url}}
   - 备注：{{note}}
{{/each}}
{{/links}}` : `Use the uploaded files, the links below, and their notes as task context.

{{#files}}
## Uploaded files

{{#each files}}
{{index}}. \`{{file_name}}\`
   - Note: {{note}}
{{/each}}
{{/files}}

{{#links}}
## Links

{{#each links}}
{{index}}. {{url}}
   - Note: {{note}}
{{/each}}
{{/links}}`;
}

function promptTemplateInsertions(language: Language): PromptTemplateInsertion[] {
  const zh = language === "zh";
  const fileLoop = "{{#files}}\n{{#each files}}\n\n\n\n{{/each}}\n{{/files}}";
  const linkLoop = "{{#links}}\n{{#each links}}\n\n\n\n{{/each}}\n{{/links}}";
  return [
    { group: "block", label: zh ? "文件区块" : "Files block", value: fileLoop, syntax: "{{#files}} … {{/files}}", cursorOffset: "{{#files}}\n{{#each files}}\n".length, description: zh ? "仅在存在本地文件时显示，并为每个文件重复中间内容。" : "Shows only when local files exist and repeats the middle content for each file.", example: zh ? "2 个文件会输出 2 段内容" : "Two files produce two entries" },
    { group: "block", label: zh ? "链接区块" : "Links block", value: linkLoop, syntax: "{{#links}} … {{/links}}", cursorOffset: "{{#links}}\n{{#each links}}\n".length, description: zh ? "仅在存在链接素材时显示，并为每个链接重复中间内容。" : "Shows only when linked sources exist and repeats the middle content for each link.", example: zh ? "2 个链接会输出 2 段内容" : "Two links produce two entries" },
    { group: "item", label: zh ? "序号" : "Index", value: "{{index}}", description: zh ? "当前循环条目的序号，从 1 开始。" : "The position of the current loop item, starting at 1.", example: "1" },
    { group: "item", label: zh ? "素材标题" : "Source title", value: "{{title}}", description: zh ? "当前素材保存时使用的标题。" : "The title saved for the current source.", example: zh ? "春季发布会参考" : "Spring launch references" },
    { group: "item", label: zh ? "本地文件名" : "Local file name", value: "{{file_name}}", description: zh ? "当前本地文件的文件名，只能放在文件循环中。" : "The local file name. Available inside the files loop only.", example: "launch-assets.pdf" },
    { group: "item", label: zh ? "网页地址" : "Web URL", value: "{{url}}", description: zh ? "当前网页素材的原始地址，只能放在链接循环中。" : "The original URL. Available inside the links loop only.", example: "https://example.com/reference" },
    { group: "item", label: zh ? "素材类型" : "Source type", value: "{{type}}", description: zh ? "当前条目的素材类型，可用于给 Agent 提示用途。" : "The current source type, useful for giving the agent context.", example: zh ? "图片" : "Image" },
    { group: "item", label: zh ? "备注内容" : "Note", value: "{{note}}", description: zh ? "你为当前素材填写的上下文；没有备注时为空。" : "Your context for the current source; blank when no note was added.", example: zh ? "保留留白和低饱和色彩" : "Keep the generous whitespace" },
    { group: "context", label: zh ? "当前 Book" : "Current Book", value: "{{book_name}}", description: zh ? "当前打开的 Book 名称。" : "The name of the currently open Book.", example: zh ? "品牌视觉参考" : "Brand references" },
    { group: "context", label: zh ? "素材总数" : "Source count", value: "{{source_count}}", description: zh ? "这次打包的全部素材数量。" : "The total number of sources in this pack.", example: "3" },
    { group: "context", label: zh ? "本地文件数" : "Local file count", value: "{{local_file_count}}", description: zh ? "可直接复制并粘贴到 Agent 的文件数量。" : "Files that can be copied and pasted into the agent.", example: "1" },
    { group: "context", label: zh ? "链接数量" : "Link count", value: "{{link_count}}", description: zh ? "将以网页链接形式提供的素材数量。" : "Sources that will be supplied as web links.", example: "2" },
  ];
}

function validatePromptTemplate(template: string) {
  const errors: string[] = [];
  const tokens = /{{\s*([^{}]+?)\s*}}/g;
  const stack: string[] = [];
  const globalFields = new Set(["book_name", "source_count", "local_file_count", "link_count"]);
  const itemFields = new Set(["index", "title", "file_name", "url", "type", "note"]);
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(template))) {
    const token = match[1].trim();
    if (token === "#files" || token === "#links") { stack.push(token.slice(1)); continue; }
    if (token === "#each files" || token === "#each links") { stack.push(token.slice(1)); continue; }
    if (token === "/files" || token === "/links" || token === "/each") {
      const expected = token === "/each" ? "each" : token.slice(1);
      const current = stack.pop();
      if (!current || (expected === "each" ? !current.startsWith("each ") : current !== expected)) errors.push(`{{${token}}}`);
      continue;
    }
    if (globalFields.has(token)) continue;
    if (itemFields.has(token)) {
      const currentLoop = [...stack].reverse().find((entry) => entry.startsWith("each "));
      if (!currentLoop || (token === "file_name" && currentLoop !== "each files") || (token === "url" && currentLoop !== "each links")) errors.push(`{{${token}}}`);
      continue;
    }
    errors.push(`{{${token}}}`);
  }
  for (const unclosed of stack.reverse()) errors.push(`{{#${unclosed}}}`);
  return [...new Set(errors)];
}

function promptTemplateContext(items: SourceItem[], language: Language, bookName: string): PromptTemplateContext {
  const makeItem = (item: SourceItem, index: number, kind: "file" | "link"): PromptTemplateItem => {
    const note = item.userNote.trim();
    return { index: String(index + 1), title: item.itemTitle, file_name: kind === "file" ? packFileName(item) : "", url: kind === "link" ? webLinkFor(item) || "" : "", type: kindLabel(item.modality, language), note };
  };
  const files = items.filter(hasCopyablePackFile);
  const links = items.filter((item) => !hasCopyablePackFile(item) && Boolean(webLinkFor(item)));
  return { book_name: bookName, source_count: String(items.length), local_file_count: String(files.length), link_count: String(links.length), files: files.map((item, index) => makeItem(item, index, "file")), links: links.map((item, index) => makeItem(item, index, "link")) };
}

function renderPromptTemplate(template: string, items: SourceItem[], language: Language, bookName: string) {
  return renderPromptTemplateContext(template, promptTemplateContext(items, language, bookName));
}

function renderPromptTemplateContext(template: string, context: PromptTemplateContext) {
  const render = (value: string, item?: PromptTemplateItem): string => {
    const conditionPattern = /{{#(files|links)}}([\s\S]*?){{\/\1}}/g;
    const loopPattern = /{{#each (files|links)}}([\s\S]*?){{\/each}}/g;
    const withConditions = value.replace(conditionPattern, (_match, key: "files" | "links", body: string) => context[key].length ? render(body, item) : "");
    const withLoops = withConditions.replace(loopPattern, (_match, key: "files" | "links", body: string) => context[key].map((entry) => render(body, entry)).join(""));
    return withLoops.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, raw: string) => {
      const key = raw.trim() as keyof PromptTemplateContext;
      if (key in context && typeof context[key] === "string") return context[key] as string;
      if (item && key in item) return item[key as keyof PromptTemplateItem];
      return "";
    });
  };
  return render(template).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizePromptTemplate(template: string, language: Language) {
  const label = language === "zh" ? "备注" : "Note";
  return template.replace(/{{\s*note_line\s*}}/g, `- ${label}: {{note}}`);
}

function samplePromptTemplateContext(language: Language): PromptTemplateContext {
  const zh = language === "zh";
  return {
    book_name: zh ? "品牌视觉参考" : "Brand references",
    source_count: "8",
    local_file_count: "5",
    link_count: "3",
    files: [
      { index: "1", title: zh ? "春季发布会视觉稿" : "Spring launch visual direction", file_name: "launch-reference.pdf", url: "", type: zh ? "文件" : "File", note: zh ? "保留大面积留白和克制的蓝色。" : "Keep the generous whitespace and restrained blue." },
      { index: "2", title: zh ? "产品摄影素材" : "Product photography assets", file_name: "product-photos.zip", url: "", type: zh ? "文件" : "File", note: zh ? "优先使用自然光场景。" : "Prioritize the natural-light scenes." },
      { index: "3", title: zh ? "品牌色彩规范" : "Brand color guidance", file_name: "brand-colors.pdf", url: "", type: zh ? "文件" : "File", note: zh ? "以深蓝和暖灰为主。" : "Use deep blue and warm gray as the primary palette." },
      { index: "4", title: zh ? "页面文案草稿" : "Page copy draft", file_name: "landing-copy.docx", url: "", type: zh ? "文件" : "File", note: zh ? "保留简洁、直接的语气。" : "Keep the tone concise and direct." },
      { index: "5", title: zh ? "交互动效参考" : "Motion reference", file_name: "motion-reference.mp4", url: "", type: zh ? "文件" : "File", note: zh ? "转场应短促且克制。" : "Keep transitions quick and restrained." },
    ],
    links: [
      { index: "1", title: zh ? "编辑排版参考" : "Editorial layout reference", file_name: "", url: "https://example.com/editorial-layout", type: zh ? "链接" : "Link", note: zh ? "参考内容层级与阅读节奏。" : "Use the hierarchy and reading rhythm as a reference." },
      { index: "2", title: zh ? "产品摄影参考" : "Product photography reference", file_name: "", url: "https://example.com/product-photography", type: zh ? "链接" : "Link", note: zh ? "注意自然光和低对比阴影。" : "Use natural light and low-contrast shadows." },
      { index: "3", title: zh ? "动效节奏参考" : "Motion pacing reference", file_name: "", url: "https://example.com/motion-pacing", type: zh ? "链接" : "Link", note: zh ? "参考开场和收尾的节奏。" : "Use the opening and closing pacing as reference." },
    ],
  };
}

function buildPackPrompt(_template: PackTemplate, _values: Record<string, string>, items: SourceItem[], language: Language) {
  return renderPromptTemplate(defaultPromptTemplate(language), items, language, "Default Book");
}
function hasLocalPackFile(item: SourceItem) { return item.assetCacheState === "cached" && Boolean(item.fileName); }
function hasCopyablePackFile(item: SourceItem) { return hasLocalPackFile(item) || ((item.modality === "text" || item.modality === "conversation") && Boolean(item.contentText?.trim())); }
function packFileName(item: SourceItem) { return hasLocalPackFile(item) ? item.fileName || item.itemTitle : `${item.itemTitle.replace(/\.txt$/i, "")}.txt`; }
function failurePreviewItems(bookId: string): SourceItem[] {
  const pickedAt = new Date().toISOString();
  const base = { bookId, favorite: false, pickType: "preview", resourceSummary: "", contentText: null, thumbnailUrl: null, faviconUrl: null, mimeType: "image/*", localPath: null, fileSize: null, metadata: {} };
  return [
    { ...base, id: "preview-invalid-link", resourceId: "preview-invalid-link", itemTitle: "Expired product reference", userNote: "Preview: source URL is no longer available.", status: "failed", pickedAt, modality: "link", contentUrl: null, sourceUrl: "https://expired.example.invalid/reference", sourceTitle: "Example site", sourceOrigin: "expired.example.invalid", assetId: null, fileName: null, assetCacheState: null, linkState: "invalid" },
    { ...base, id: "preview-missing-file", resourceId: "preview-missing-file", itemTitle: "Missing local image", userNote: "Preview: the managed local file cannot be found.", status: "missing", pickedAt, modality: "image", contentUrl: "https://example.invalid/missing-image.jpg", sourceUrl: "https://example.invalid/missing-image.jpg", sourceTitle: "Example CDN", sourceOrigin: "example.invalid", assetId: "preview-missing-file", fileName: "missing-image.jpg", assetCacheState: "missing", linkState: "linked" },
    { ...base, id: "preview-download-failed", resourceId: "preview-download-failed", itemTitle: "Image download failed", userNote: "Preview: Sourcebook could not save a local copy from this URL.", status: "failed", pickedAt, modality: "image", contentUrl: "https://example.invalid/download-failed.jpg", sourceUrl: "https://example.invalid/download-failed.jpg", sourceTitle: "Example CDN", sourceOrigin: "example.invalid", assetId: "preview-download-failed", fileName: null, assetCacheState: "failed", linkState: "linked" },
  ];
}
function matchesDate(value: string, filter: DateFilter, startValue: string, endValue: string) { const date = new Date(value); if (Number.isNaN(date.getTime()) || filter === "all") return filter === "all"; const now = new Date(); const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()); const today = startOfDay(now); if (filter === "today") return date >= today; if (filter === "yesterday") { const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); return date >= yesterday && date < today; } if (filter === "week") { const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6); return date >= weekStart; } if (filter === "custom") { const start = startValue ? new Date(`${startValue}T00:00:00`) : null; const end = endValue ? new Date(`${endValue}T23:59:59.999`) : null; return (!start || date >= start) && (!end || date <= end); } return true; }
function bookPath(path: string, bookId: string | undefined) { if (!bookId || !path.startsWith("/api/")) return path; return `${path}${path.includes("?") ? "&" : "?"}bookId=${encodeURIComponent(bookId)}`; }
async function fileToBase64(file: File) { const buffer = await file.arrayBuffer(); let value = ""; const bytes = new Uint8Array(buffer); for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(value); }
async function requestBackupRestore(file: File, mode: "append" | "replace") { const response = await fetch(`/api/library/restore?mode=${encodeURIComponent(mode)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Request failed (${response.status})`); return response.json() as Promise<BackupRestoreResponse>; }
async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Request failed (${response.status})`); return response.json() as Promise<T>; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Try again."; }
