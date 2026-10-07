import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Check, ChevronDown, CircleCheck, CircleHelp, CircleX, CloudOff, Copy, Download, EllipsisVertical, ExternalLink, FileText, FileUp, FileWarning, Funnel, HardDrive, Image, Languages, Link2, Link2Off, LoaderCircle, Maximize2, MessageSquare, Music2, Package, Pencil, Play, Plus, Puzzle, RefreshCw, Search, Send, Settings, Sparkles, Square, Star, Trash2, Upload, Video, Workflow, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import TurndownService from "turndown";

type Language = "en" | "zh";
type Modality = "text" | "image" | "video" | "audio" | "file" | "link" | "conversation";
type LocalCopyState = "pending" | "cached" | "downloading" | "failed" | "missing" | null;
type LinkState = "linked" | "invalid" | "none";
type SourceItem = { id: string; bookId: string; resourceId: string; itemTitle: string; userNote: string; status: string; pickedAt: string; favorite: boolean; modality: Modality; pickType: string; resourceSummary: string; contentText: string | null; contentUrl: string | null; thumbnailUrl: string | null; sourceUrl: string; sourceTitle: string; sourceOrigin: string; faviconUrl: string | null; assetId: string | null; mimeType: string | null; fileName: string | null; localPath: string | null; fileSize: number | null; assetCacheState: LocalCopyState; linkState: LinkState; metadata: { description?: string; pageTitle?: string; ogTitle?: string; siteName?: string; canonicalUrl?: string; ogImage?: string; mediaPreviewUrl?: string; videoPreviewUrl?: string; mediaDurationSeconds?: number; conversation?: { provider?: string } } };
type SourcePack = { id: string; warnings: string[] };
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

const interfaceCopy = {
  en: {
    showing: "Showing", search: "Search sources", filter: "Filter", favorites: "Favorites only", masonry: "Masonry view", list: "List view", refresh: "Refresh sources", noSources: "No sources yet", noMatches: "No matching sources", emptyGuide: "Use the Picker extension to collect web content or import local files.", tryAnother: "Try another search or filter.", settings: "Settings", setting: "Setting", help: "Help", feedback: "Feedback", installPicker: "Install Picker", switchLanguage: "中文", switchBook: "Switch Sourcebook", importLocalFiles: "Import local files", clearSearch: "Clear search",
    close: "Close", cancel: "Cancel", save: "Save", delete: "Delete", copy: "Copy", copyFiles: "Copy files", copyLink: "Copy link", select: "Select", selected: "Selected", unselect: "Unselect", edit: "Edit", loading: "Loading…", loadMore: "Load more", loadingSources: "Loading sources", readingSources: "Reading from your local Sourcebook.", selectAll: "Select all", clear: "Deselect all", addNote: "Add note", packForAgent: "Pack for agent", sourcesSelected: "sources selected", sourceSelected: "source selected", note: "Note", info: "Info", source: "Source", picked: "Picked", format: "Format", size: "Size", localLink: "Local link", webLink: "Web link", localFile: "Local file", link: "Link", image: "Image", video: "Video", audio: "Audio", text: "Text", chat: "Chat", file: "File", open: "Open", visit: "Visit", view: "View", play: "Play", download: "Download", downloading: "Downloading", missing: "Missing", fileMissing: "File missing", downloadFailed: "Download failed", retry: "Retry", invalid: "Invalid", invalidLink: "Invalid link", copyForAgent: "Copy for agent", openDetail: "Open source detail", closeDetail: "Close detail", addFavorite: "Add to favorites", removeFavorite: "Remove from favorites", editTitle: "Edit title", saveTitle: "Save title", cancelTitleEdit: "Cancel title edit", sourceTitle: "Source title", showInFolder: "Show in folder", viewLocalFile: "View local file", downloadAgain: "Download this file again", retryDownload: "Retry download", downloadLocalFile: "Download local file", moveTo: "Move to…", confirmDelete: "Confirm delete", deleteSources: "Delete sources", deleteBook: "Delete Book", bookSetting: "Book Setting", newBook: "New Book", bookName: "Book name", createBook: "Create Book", targetBook: "Target Book", copyHere: "Copy here", moveHere: "Move here", exportBackup: "Export backup", importBackup: "Import backup", markdownContent: "Markdown content", mediaPreview: "Media preview", closePreview: "Close preview", downloadImage: "Download image", downloadMissingFile: "Download missing file?", imageDownloadMessage: "Sourcebook will save a local copy of this image in the current Book.", missingDownloadMessage: "A local copy is missing. Sourcebook will download it again into this Book.", addContext: "Add context for the agent…", noteHelp: "This note is added to the Pack prompt so the agent can understand your intent.", notSavedLocally: "Not saved locally",
  },
  zh: {
    showing: "显示", search: "搜索素材", filter: "筛选", favorites: "仅看收藏", masonry: "瀑布流视图", list: "列表视图", refresh: "刷新素材", noSources: "还没有素材", noMatches: "没有匹配的素材", emptyGuide: "使用 Picker插件获取网页内容 或 导入本地文件", tryAnother: "请尝试其他搜索词或筛选条件。", settings: "设置", setting: "设置", help: "帮助", feedback: "反馈", installPicker: "安装Picker", switchLanguage: "English", switchBook: "切换 Sourcebook", importLocalFiles: "导入本地文件", clearSearch: "清空搜索",
    close: "关闭", cancel: "取消", save: "保存", delete: "删除", copy: "复制", copyFiles: "复制文件", copyLink: "复制链接", select: "选择", selected: "已选择", unselect: "取消选择", edit: "编辑", loading: "加载中…", loadMore: "加载更多", loadingSources: "正在加载素材", readingSources: "正在读取本地 Sourcebook。", selectAll: "全选", clear: "取消选择", addNote: "添加备注", packForAgent: "发送给 Agent", sourcesSelected: "个素材已选择", sourceSelected: "个素材已选择", note: "备注", info: "信息", source: "来源", picked: "Pick时间", format: "格式", size: "大小", localLink: "本地链接", webLink: "网页链接", localFile: "本地文件", link: "链接", image: "图片", video: "视频", audio: "音频", text: "文本", chat: "对话", file: "文件", open: "打开", visit: "跳转", view: "查看", play: "播放", download: "下载", downloading: "下载中", missing: "文件丢失", fileMissing: "文件丢失", downloadFailed: "下载失败", retry: "重试", invalid: "无效", invalidLink: "链接无效", copyForAgent: "复制给 Agent", openDetail: "打开素材详情", closeDetail: "关闭详情", addFavorite: "收藏", removeFavorite: "取消收藏", editTitle: "编辑标题", saveTitle: "保存标题", cancelTitleEdit: "取消编辑标题", sourceTitle: "素材标题", showInFolder: "在文件夹中显示", viewLocalFile: "查看本地文件", downloadAgain: "重新下载此文件", retryDownload: "重试下载", downloadLocalFile: "下载本地文件", moveTo: "移动到…", confirmDelete: "确认删除", deleteSources: "删除素材", deleteBook: "删除 Book", bookSetting: "Book 设置", newBook: "新建 Book", bookName: "Book 名称", createBook: "创建 Book", targetBook: "目标 Book", copyHere: "复制到这里", moveHere: "移动到这里", exportBackup: "导出备份", importBackup: "导入备份", markdownContent: "Markdown 内容", mediaPreview: "媒体预览", closePreview: "关闭预览", downloadImage: "下载图片", downloadMissingFile: "下载丢失文件？", imageDownloadMessage: "Sourcebook 会将此图片的本地副本保存到当前 Book。", missingDownloadMessage: "本地副本已丢失，Sourcebook 将重新下载到当前 Book。", addContext: "补充给 Agent 的上下文…", noteHelp: "此备注会加入 Pack 提示词，帮助 Agent 更好理解你的意图。", notSavedLocally: "尚未保存到本地",
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

function kindLabel(modality: Modality, language: Language) { return interfaceCopy[language][modality === "conversation" ? "chat" : modality]; }
const kindIcon = { text: FileText, image: Image, video: Video, audio: Music2, file: FileText, link: Link2, conversation: Workflow } satisfies Record<Modality, typeof FileText>;
const localImportExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".mov", ".webm", ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".rtf", ".json", ".html", ".htm"];
const localImportAccept = localImportExtensions.join(",");
const pickerInstallUrl = "https://github.com/Yanze-He/sourcebook-for-agents/tree/main/apps/picker#readme";
const markdownSerializer = new TurndownService({ bulletListMarker: "-", codeBlockStyle: "fenced", linkStyle: "inlined" });
function toggleFilterValue<T>(values: T[], value: T) { return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]; }

export default function SourcebookSources() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState("");
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isCreateBookOpen, setIsCreateBookOpen] = useState(false);
  const [renameBookTarget, setRenameBookTarget] = useState<Book | null>(null);
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null);
  const [transferItem, setTransferItem] = useState<SourceItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const [language, setLanguage] = useState<"en" | "zh">(() => window.localStorage.getItem("sourcebook-language") === "zh" || (window.localStorage.getItem("sourcebook-language") === null && navigator.language.toLowerCase().startsWith("zh")) ? "zh" : "en");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [detailItem, setDetailItem] = useState<SourceItem | null>(null);
  const [previewItem, setPreviewItem] = useState<SourceItem | null>(null);
  const [isPackOpen, setIsPackOpen] = useState(false);
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
  const packRef = useRef<HTMLDivElement | null>(null);
  const copy = interfaceCopy[language];

  function showSourcesMessage(nextMessage: string, duration = 3600, tone: "neutral" | "success" | "error" = "neutral") {
    if (messageTimeoutRef.current) window.clearTimeout(messageTimeoutRef.current);
    setMessageTone(tone);
    setMessage(nextMessage);
    messageTimeoutRef.current = duration ? window.setTimeout(() => setMessage(null), duration) : null;
  }

  async function loadItems({ announce = false, background = false, limit = sourcePageSize }: { announce?: boolean; background?: boolean; limit?: number } = {}) {
    const requestStartedAt = Date.now();
    if (announce) { setIsRefreshing(true); showSourcesMessage("Refreshing sources…", 0); }
    else if (!background) setLoading(true);
    try {
      const response = await request<SourcePage>(bookPath(`/api/sources?limit=${limit}`, activeBookId));
      const nextItems = failurePreviewEnabled ? [...failurePreviewItems(activeBookId), ...response.items] : response.items;
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
    const response = await request<{ activeBookId: string; books: Book[] }>("/api/books");
    setBooks(response.books); setActiveBookId(response.activeBookId);
  }
  useEffect(() => { void loadBooks().then(() => void loadItems()); }, []);
  useEffect(() => { if (activeBookId) void loadItems(); }, [activeBookId]);
  useEffect(() => { if (activeBookId && (query.trim() || kind.length || source.length || linkFilter.length || localFilter.length || dateFilter !== "all" || onlyFavorites)) void loadItems({ limit: bookSourceLimit }); }, [activeBookId, dateEnd, dateFilter, dateStart, kind, linkFilter, localFilter, onlyFavorites, query, source]);
  useEffect(() => { if (!items.some((item) => item.assetCacheState === "downloading")) return; const timer = window.setInterval(() => void loadItems({ background: true }), 1500); return () => window.clearInterval(timer); }, [activeBookId, items]);
  useEffect(() => () => { if (messageTimeoutRef.current) window.clearTimeout(messageTimeoutRef.current); }, []);
  useEffect(() => {
    const closeIfOutside = (event: MouseEvent) => { if (!settingsRef.current?.contains(event.target as Node)) setIsSettingsOpen(false); if (!filterRef.current?.contains(event.target as Node)) setIsFiltersOpen(false); if (!bookRef.current?.contains(event.target as Node)) setIsBookOpen(false); if (!packRef.current?.contains(event.target as Node)) setIsPackOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setIsSettingsOpen(false); setIsFiltersOpen(false); setIsBookOpen(false); setIsPackOpen(false); } };
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeIfOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; window.localStorage.setItem("sourcebook-language", language); }, [language]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchesQuery = !normalizedQuery || [item.itemTitle, item.sourceTitle, item.sourceOrigin, item.contentText, item.metadata.description].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    return matchesQuery && matchesDate(item.pickedAt, dateFilter, dateStart, dateEnd) && (!kind.length || kind.includes(item.modality)) && (!source.length || source.includes(sourceLabel(item))) && (!linkFilter.length || linkFilter.includes(item.linkState as Exclude<LinkFilter, "all">)) && (!localFilter.length || localFilter.includes(localState(item) as Exclude<LocalFilter, "all">)) && (!onlyFavorites || item.favorite);
  }), [dateEnd, dateFilter, items, kind, linkFilter, localFilter, onlyFavorites, query, source]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const sourceOptions = useMemo(() => [...new Set(items.map(sourceLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const selectVisibleItems = () => setSelectedIds(visibleItems.map((item) => item.id));
  const selectFromDetail = (id: string) => { toggleSelected(id); setDetailItem(null); };
  async function copySource(item: SourceItem) {
    try {
      if (hasCopyablePackFile(item)) {
        const result = await request<{ copied: number }>(bookPath("/api/source-packs/copy-materials", item.bookId), { method: "POST", body: JSON.stringify({ sourceItemIds: [item.id] }) });
        showSourcesMessage(language === "zh" ? `已复制 ${result.copied} 个文件。` : `Copied ${result.copied} file${result.copied === 1 ? "" : "s"}.`, 3600, "success");
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
      const detail = result.skipped ? (language === "zh" ? `；${result.skipped} 个没有本地文件的素材可通过复制提示词以链接提供` : `; use Copy prompt to include ${result.skipped} source${result.skipped === 1 ? "" : "s"} without a local file as links`) : "";
      showSourcesMessage(language === "zh" ? `已复制 ${result.copied} 个文件${detail}。` : `Copied ${result.copied} file${result.copied === 1 ? "" : "s"}${detail}.`, 3600, "success");
      return true;
    } catch (error) {
      showSourcesMessage(language === "zh" ? `无法复制素材：${errorMessage(error)}` : `Could not copy sources: ${errorMessage(error)}`, 6000, "error");
      return false;
    }
  }
  async function copyPackPrompt() {
    try {
      await navigator.clipboard.writeText(buildPackPrompt(packTemplates(language)[0], {}, selectedItems, language));
      showSourcesMessage(language === "zh" ? "提示词已复制，可粘贴到 Agent 对话框。" : "Prompt copied. Paste it into your agent chat.", 3600, "success");
    } catch (error) {
      showSourcesMessage(language === "zh" ? `无法复制提示词：${errorMessage(error)}` : `Could not copy prompt: ${errorMessage(error)}`, 6000, "error");
    }
  }
  async function removeSelected() {
    if (!selectedIds.length) return;
    try {
      await request(bookPath("/api/sources", activeBookId), { method: "DELETE", body: JSON.stringify({ sourceItemIds: selectedIds }) });
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
      await request(`/api/books/${encodeURIComponent(bookId)}/activate`, { method: "POST" });
      setActiveBookId(bookId); setSelectedIds([]); setDetailItem(null); setIsBookOpen(false);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function createBook(name: string) {
    try {
      const response = await request<{ book: Book }>("/api/books", { method: "POST", body: JSON.stringify({ name }) });
      await loadBooks(); await selectBook(response.book.id); setIsCreateBookOpen(false);
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
      const response = await request<{ activeBookId: string; books: Book[] }>(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
      setBooks(response.books); setActiveBookId(response.activeBookId); setSelectedIds([]); setDetailItem(null); setDeleteBookTarget(null);
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function transferSource(targetBookId: string, mode: "copy" | "move") {
    if (!transferItem) return;
    try {
      await request(`/api/books/${encodeURIComponent(activeBookId)}/sources/${encodeURIComponent(transferItem.id)}/transfer`, { method: "POST", body: JSON.stringify({ targetBookId, mode }) });
      setTransferItem(null); setDetailItem(null); await loadItems(); showSourcesMessage(mode === "move" ? "Source moved to the selected Book." : "Source copied to the selected Book.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function exportBackup() {
    try {
      const response = await fetch("/api/library/backup");
      if (!response.ok) throw new Error("Could not export backup");
      const blob = await response.blob(), href = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = href; link.download = `sourcebook-${new Date().toISOString().slice(0, 10)}.sourcebook-backup`; link.click(); URL.revokeObjectURL(href);
      showSourcesMessage("Backup downloaded.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function importBackup(file: File) {
    const mode = window.confirm("Import as new Books? Choose Cancel to replace the entire library.") ? "append" : "replace";
    try {
      const archive = await fileToBase64(file);
      await request("/api/library/restore", { method: "POST", body: JSON.stringify({ archive, mode }) });
      await loadBooks(); await loadItems(); showSourcesMessage(mode === "replace" ? "Library restored from backup." : "Backup imported as new Books.");
    } catch (error) { setMessage(errorMessage(error)); }
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

  return <LanguageContext.Provider value={language}><main className="app-shell public-sources-shell">
    <section className="sources-page sources-surface public-sources-surface" aria-label="Sources">
      <header className="panel-head">
        <div className="panel-title-block"><div className="book-title-row"><SourcebookLockup /><div className="book-switcher" ref={bookRef}><button aria-expanded={isBookOpen} aria-haspopup="menu" aria-label={copy.switchBook} className={`book-switcher-button ${isBookOpen ? "is-open" : ""}`} onClick={() => setIsBookOpen((open) => !open)} type="button"><span>{books.find((book) => book.id === activeBookId)?.name || "Default Book"}</span><ChevronDown aria-hidden="true" className="book-switcher-chevron" size={14} /></button>{isBookOpen ? <div className="book-switcher-menu" role="menu">{books.map((book) => <div className="book-menu-item" key={book.id}><button aria-label={`Book actions for ${book.name}`} className="book-options-button" data-tooltip={copy.setting} onClick={() => { setIsBookOpen(false); setRenameBookTarget(book); }} type="button"><EllipsisVertical size={14} /></button><button aria-pressed={book.id === activeBookId} className="book-menu-select" onClick={() => void selectBook(book.id)} role="menuitem" type="button"><span>{book.name}</span>{book.id === activeBookId ? <Check size={14} /> : null}</button></div>)}<button className="book-new-button" onClick={() => { setIsBookOpen(false); setIsCreateBookOpen(true); }} type="button"><Plus size={14} />{copy.newBook}</button></div> : null}</div><div className="book-actions"><button aria-label={copy.importLocalFiles} className="icon-button local-import-button" data-tooltip={copy.importLocalFiles} onClick={() => localImportInputRef.current?.click()} title={copy.importLocalFiles} type="button"><FileUp size={16} /></button><div className="settings-menu" ref={settingsRef}><button aria-label={copy.settings} aria-expanded={isSettingsOpen} className="icon-button" data-tooltip={copy.settings} onClick={() => setIsSettingsOpen((open) => !open)} title={copy.settings} type="button"><Settings size={16} /></button>{isSettingsOpen ? <div className="settings-popover" role="menu"><button onClick={() => { openPickerInstall(); setIsSettingsOpen(false); }} role="menuitem" type="button"><Puzzle size={15} /><span>{copy.installPicker}</span></button><button onClick={() => void exportBackup()} role="menuitem" type="button"><Download size={15} /><span>{copy.exportBackup}</span></button><button onClick={() => backupInputRef.current?.click()} role="menuitem" type="button"><Upload size={15} /><span>{copy.importBackup}</span></button><button onClick={() => { window.open("https://github.com/Yanze-He/sourcebook-for-agents#readme", "_blank", "noopener,noreferrer"); setIsSettingsOpen(false); }} role="menuitem" type="button"><CircleHelp size={15} /><span>{copy.help}</span></button><button onClick={() => { window.open("https://github.com/Yanze-He/sourcebook-for-agents/issues/new/choose", "_blank", "noopener,noreferrer"); setIsSettingsOpen(false); }} role="menuitem" type="button"><MessageSquare size={15} /><span>{copy.feedback}</span></button><button onClick={() => { setLanguage((current) => current === "en" ? "zh" : "en"); setIsSettingsOpen(false); }} role="menuitem" type="button"><Languages size={15} /><span>{copy.switchLanguage}</span></button></div> : null}</div><button aria-label={copy.refresh} className="icon-button" data-tooltip={copy.refresh} onClick={() => void loadItems({ announce: true })} title={copy.refresh} type="button" disabled={loading || isRefreshing}><RefreshCw className={isRefreshing ? "spin" : undefined} size={16} /></button></div></div></div>
        <div className="drawer-search-tools">
          <span className="sources-filter-count">{copy.showing}: {visibleItems.length} / {totalItems}</span>
          <label className={`search-box sources-search source-item-search ${query || isSearchFocused ? "is-active" : ""}`}><Search size={15} strokeWidth={1.8} /><input placeholder={copy.search} value={query} onBlur={() => setIsSearchFocused(false)} onChange={(event) => setQuery(event.target.value)} onFocus={() => setIsSearchFocused(true)} />{query ? <button aria-label={copy.clearSearch} className="search-clear-button" data-tooltip={copy.clearSearch} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery("")} title={copy.clearSearch} type="button"><X size={13} /></button> : null}</label>
          <div className="filter-menu" ref={filterRef}><button aria-label={copy.filter} className="filter-menu-button icon-only" aria-expanded={isFiltersOpen} aria-pressed={Boolean(kind.length || source.length || linkFilter.length || localFilter.length || dateFilter !== "all")} data-tooltip={copy.filter} onClick={() => setIsFiltersOpen((open) => !open)} title={copy.filter} type="button"><Funnel size={15} /></button>{isFiltersOpen ? <FilterPopover copy={copy} dateEnd={dateEnd} dateFilter={dateFilter} dateStart={dateStart} kind={kind} linkFilter={linkFilter} localFilter={localFilter} source={source} sourceOptions={sourceOptions} onDateEndChange={setDateEnd} onDateFilterChange={(value) => setDateFilter((current) => current === value ? "all" : value)} onDateStartChange={setDateStart} onKindChange={(value) => setKind((current) => toggleFilterValue(current, value))} onLinkFilterChange={(value) => setLinkFilter((current) => toggleFilterValue(current, value))} onLocalFilterChange={(value) => setLocalFilter((current) => toggleFilterValue(current, value))} onReset={() => { setKind([]); setSource([]); setLinkFilter([]); setLocalFilter([]); setDateFilter("all"); setDateStart(""); setDateEnd(""); }} onSourceChange={(value) => setSource((current) => toggleFilterValue(current, value))} /> : null}</div>
          <button aria-label={copy.favorites} className="favorite-filter-button icon-only" aria-pressed={onlyFavorites} data-tooltip={copy.favorites} onClick={() => setOnlyFavorites((active) => !active)} title={copy.favorites} type="button"><Star size={15} fill={onlyFavorites ? "currentColor" : "none"} /></button>
          <input accept={localImportAccept} className="visually-hidden" multiple onChange={(event) => { if (event.target.files?.length) void importLocalFiles(Array.from(event.target.files)); event.currentTarget.value = ""; }} ref={localImportInputRef} type="file" /><input accept=".sourcebook-backup" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ""; }} ref={backupInputRef} type="file" />
        </div>
      </header>
      {loading ? <EmptyState icon={<LoaderCircle className="spin" size={22} />} title={copy.loadingSources} description={copy.readingSources} /> : null}
      {!loading && visibleItems.length === 0 ? <EmptyState icon={<Package size={24} />} title={items.length ? copy.noMatches : copy.noSources} description={items.length ? copy.tryAnother : emptySourceDescription} /> : null}
      {!loading && visibleItems.length > 0 ? <SourceMasonry items={visibleItems} selectedIds={selectedIds} hasMore={Boolean(nextCursor)} isLoadingMore={isLoadingMore} onFavorite={toggleFavorite} onLoadMore={() => void loadMoreItems()} onOpen={setDetailItem} onOpenLocal={openLocalFile} onPreview={setPreviewItem} onRequestDownload={setDownloadConfirmItem} onRetryDownload={setDownloadConfirmItem} onToggle={toggleSelected} /> : null}
      {selectedIds.length > 0 ? <footer className="sources-footer"><div className="sources-selection-summary"><span>{selectedIds.length} {selectedIds.length === 1 ? copy.sourceSelected : copy.sourcesSelected}</span><button className="text-button sources-select-all-button" disabled={selectedIds.length === visibleItems.length && selectedIds.every((id) => visibleItems.some((item) => item.id === id))} onClick={selectVisibleItems} type="button">{copy.selectAll}</button></div><div className="sources-footer-actions"><button className="secondary-button" onClick={() => setSelectedIds([])} type="button"><X size={15} />{copy.clear}</button><button className="secondary-button" onClick={() => setIsBatchNoteOpen(true)} type="button"><MessageSquare size={15} />{copy.addNote}</button><button className="secondary-button sources-delete-button" onClick={() => setIsDeleteOpen(true)} type="button"><Trash2 size={15} />{copy.delete}</button><div className="sources-pack-wrap" ref={packRef}><button aria-expanded={isPackOpen} className={`primary-button sources-pack-button ${isPackOpen ? "is-open" : ""}`} onClick={() => setIsPackOpen((open) => !open)} type="button"><Package size={15} />{copy.packForAgent}</button>{isPackOpen ? <PackPopover items={selectedItems} language={language} onClose={() => setIsPackOpen(false)} onCopyMaterials={copyPackedMaterials} onCopyPrompt={copyPackPrompt} /> : null}</div></div></footer> : null}
      {message ? <p className={`sources-message is-${messageTone}`} role="status">{isRefreshing || isImporting ? <LoaderCircle className="spin" size={14} /> : messageTone === "success" ? <CircleCheck aria-hidden="true" size={15} /> : messageTone === "error" ? <CircleX aria-hidden="true" size={15} /> : null}{message}</p> : null}
    </section>
    <SourceDetailModal item={detailItem} isSelected={Boolean(detailItem && selectedIds.includes(detailItem.id))} onClose={() => setDetailItem(null)} onContentSave={saveContent} onCopy={copySource} onDelete={removeItem} onFavorite={toggleFavorite} onNoteSave={saveNote} onOpenLocal={openLocalFile} onPreview={setPreviewItem} onRequestDownload={setDownloadConfirmItem} onRetryDownload={startDownload} onRevealLocal={revealLocalFile} onSelect={selectFromDetail} onTitleSave={saveTitle} />
    <DeleteModal count={selectedIds.length} isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={() => void removeSelected()} />
    <CreateBookModal isOpen={isCreateBookOpen} onClose={() => setIsCreateBookOpen(false)} onCreate={createBook} />
    <RenameBookModal book={renameBookTarget} canDelete={books.length > 1} onClose={() => setRenameBookTarget(null)} onDelete={() => { if (renameBookTarget) { setDeleteBookTarget(renameBookTarget); setRenameBookTarget(null); } }} onRename={renameBook} />
    <DeleteBookModal book={deleteBookTarget} onClose={() => setDeleteBookTarget(null)} onConfirm={removeBook} />
    <TransferModal books={books.filter((book) => book.id !== activeBookId)} item={transferItem} onClose={() => setTransferItem(null)} onTransfer={transferSource} />
    <BatchNoteModal count={selectedIds.length} isOpen={isBatchNoteOpen} onClose={() => setIsBatchNoteOpen(false)} onConfirm={appendBatchNote} />
    <SourcePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    <DownloadImageModal item={downloadConfirmItem} onClose={() => setDownloadConfirmItem(null)} onConfirm={startDownload} />
  </main></LanguageContext.Provider>;
}

function SourceMasonry({ items, selectedIds, hasMore, isLoadingMore, onLoadMore, onFavorite, onOpen, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onToggle }: { items: SourceItem[]; selectedIds: string[]; hasMore: boolean; isLoadingMore: boolean; onLoadMore: () => void; onFavorite: (id: string, favorite: boolean) => void; onOpen: (item: SourceItem) => void; onOpenLocal: (item: SourceItem) => void; onPreview: (item: SourceItem) => void; onRequestDownload: (item: SourceItem) => void; onRetryDownload: (item: SourceItem) => void; onToggle: (id: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const ref = useRef<HTMLDivElement | null>(null); const [columnCount, setColumnCount] = useState(4);
  useEffect(() => { const element = ref.current; if (!element) return; const update = () => setColumnCount(element.clientWidth < 500 ? 1 : Math.max(2, Math.min(5, Math.floor((element.clientWidth + 12) / 252)))); update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect(); }, []);
  const columns = Array.from({ length: columnCount }, () => [] as SourceItem[]); items.forEach((item, index) => columns[index % columnCount].push(item));
  return <div className={`source-masonry ${selectedIds.length ? "is-selecting" : ""}`} ref={ref}><div className="source-masonry-columns" style={{ "--source-column-count": columnCount } as React.CSSProperties}>{columns.map((column, index) => <div className="source-masonry-column" key={index}>{column.map((item) => <SourceCard item={item} key={item.id} selected={selectedIds.includes(item.id)} onFavorite={() => onFavorite(item.id, !item.favorite)} onOpen={() => onOpen(item)} onOpenLocal={() => onOpenLocal(item)} onPreview={() => onPreview(item)} onRequestDownload={() => onRequestDownload(item)} onRetryDownload={() => onRetryDownload(item)} onToggle={() => onToggle(item.id)} />)}</div>)}</div>{hasMore ? <div className="source-load-more"><button className="secondary-button" disabled={isLoadingMore} onClick={onLoadMore} type="button">{isLoadingMore ? copy.loading : copy.loadMore}</button></div> : null}</div>;
}

function SourceCard({ item, selected, onFavorite, onOpen, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onToggle }: { item: SourceItem; selected: boolean; onFavorite: () => void; onOpen: () => void; onOpenLocal: () => void; onPreview: () => void; onRequestDownload: () => void; onRetryDownload: () => void; onToggle: () => void }) {
  const language = useLanguage(); const copy = interfaceCopy[language];
  const excerpt = descriptionFor(item);
  const isWebLink = item.modality === "link" && item.pickType !== "local_import";
  const isWebVideo = isWebVideoReference(item);
  const hasTextArtwork = item.modality === "text" || item.modality === "conversation";
  const hasVisual = ["image", "video", "audio", "conversation", "file"].includes(item.modality) || isWebLink || hasTextArtwork;
  const isPlayable = (item.modality === "video" || item.modality === "audio") && !isWebVideo;
  const previewable = item.modality === "image" || isPlayable;
  const openableLocalFile = item.modality === "file" && localFileState(item) === "cached";
  const duration = useMediaDuration(item);
  const previewLabel = item.modality === "audio" ? copy.play + " " + copy.audio : item.modality === "video" ? copy.play + " " + copy.video : copy.view + " " + copy.image;
  const previewAction = isPlayable ? copy.play : copy.view;
  const usesFallbackArtwork = hasVisual && !hasTextArtwork && !hasRenderableThumbnail(item);
  return <article className={`source-masonry-card kind-${item.modality} ${usesFallbackArtwork ? "has-fallback-artwork" : ""} ${selected ? "selected" : ""}`} onClick={onOpen}>
    {hasVisual ? <div className="source-masonry-media preserve-media-ratio">{previewable ? <button aria-label={copy.openDetail} className="source-masonry-media-button" data-tooltip={copy.openDetail} onClick={(event) => { event.stopPropagation(); onOpen(); }} type="button"><SourceThumbnail item={item} /></button> : <SourceThumbnail item={item} />}{(item.modality === "video" || item.modality === "audio") && duration !== null ? <span className="media-duration">{formatDuration(duration)}</span> : null}{previewable ? <button aria-label={previewLabel} className="source-masonry-external-action" onClick={(event) => { event.stopPropagation(); onPreview(); }} type="button">{isPlayable ? <Play fill="currentColor" size={15} /> : <Maximize2 size={15} />}<span>{previewAction}</span></button> : null}{(isWebLink || isWebVideo) ? <button aria-label="Open link in browser" className="source-masonry-external-action" onClick={(event) => { event.stopPropagation(); openWebLink(item); }} type="button"><ExternalLink size={15} /><span>{copy.visit}</span></button> : null}{openableLocalFile ? <button aria-label="Open file" className="source-masonry-external-action" onClick={(event) => { event.stopPropagation(); onOpenLocal(); }} type="button"><ExternalLink size={15} /><span>{copy.open}</span></button> : null}</div> : null}
    <div className="source-masonry-body"><div className="source-masonry-kind"><TypeBadge fileSize={item.fileSize} mimeType={item.mimeType} modality={item.modality} pickType={item.pickType} /><button aria-label={item.favorite ? copy.removeFavorite : copy.addFavorite} aria-pressed={item.favorite} className={`favorite-star source-card-favorite ${item.favorite ? "active" : ""}`} data-tooltip={item.favorite ? copy.removeFavorite : copy.addFavorite} onClick={(event) => { event.stopPropagation(); onFavorite(); }} type="button"><Star size={13} fill={item.favorite ? "currentColor" : "none"} /></button><DataStatus item={item} onRequestDownload={onRequestDownload} onRetryDownload={onRetryDownload} /></div><h2 title={item.itemTitle}>{item.itemTitle}</h2><div className="source-masonry-origin"><span>{sourceLabel(item)}</span><span aria-hidden="true">·</span><time>{formatDate(item.pickedAt)}</time></div>{!hasTextArtwork && !isWebLink && excerpt ? <p className="source-masonry-excerpt">{excerpt}</p> : null}{!hasVisual && !excerpt ? <div className="source-masonry-abstract"><SourceThumbnail item={item} /></div> : null}<div className="source-card-actions">{item.userNote ? <span className="source-note-summary" title={item.userNote}><MessageSquare aria-hidden="true" size={12} /><span>{item.userNote}</span></span> : null}<div className="source-card-primary-actions"><button className="source-select-button" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onToggle(); }} type="button">{selected ? <Check size={14} /> : <Square size={14} />}{selected ? copy.selected : copy.select}</button></div></div></div>
  </article>;
}

function SourceThumbnail({ item, compact = false }: { item: SourceItem; compact?: boolean }) {
  const isLocalFile = item.modality === "file" || item.modality === "link" && item.pickType === "local_import";
  const isWebLink = item.modality === "link" && !isLocalFile;
  const Icon = isLocalFile ? FileText : kindIcon[item.modality];
  const fileLabel = isLocalFile ? (item.fileName?.split(".").at(-1) || fileFormat(item.mimeType)).toUpperCase() : null;
  const useVideoFrame = item.modality === "video" && item.assetCacheState === "cached" && !item.metadata.mediaPreviewUrl && Boolean(item.thumbnailUrl);
  const useImagePreview = !isWebLink && hasRenderableThumbnail(item) && !useVideoFrame;
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string | undefined>();
  useEffect(() => { setVideoFrameReady(false); }, [item.id, item.thumbnailUrl, useVideoFrame]);
  useEffect(() => { setVideoAspectRatio(undefined); }, [item.id, item.thumbnailUrl, useVideoFrame]);
  const readVideoMetadata = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) setVideoAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
    if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = Math.min(0.1, video.duration / 2);
  };
  return <div className={`thumb ${compact ? "compact" : ""} ${item.modality === "link" && !isLocalFile ? "webpage-artwork" : ""}`} style={!compact && videoAspectRatio ? { aspectRatio: videoAspectRatio } : undefined}>
    {item.modality === "text" || item.modality === "conversation" ? <TextArtwork item={item} /> : null}
    {item.modality !== "text" && item.modality !== "conversation" && useVideoFrame ? <><span className="thumb-fallback"><Icon size={compact ? 19 : 28} /></span><video className={`media-thumb media-video-frame ${videoFrameReady ? "is-ready" : ""}`} muted onCanPlay={() => setVideoFrameReady(true)} onError={() => setVideoFrameReady(false)} onLoadedMetadata={(event) => readVideoMetadata(event.currentTarget)} playsInline preload="auto" src={item.thumbnailUrl ?? undefined} /></> : null}
    {item.modality !== "text" && item.modality !== "conversation" && !useVideoFrame && useImagePreview ? <img className="media-thumb" src={item.thumbnailUrl ?? undefined} alt="" /> : null}
    {item.modality !== "text" && item.modality !== "conversation" && !useVideoFrame && !useImagePreview ? <span className="thumb-fallback">{fileLabel ? <span className="thumb-file-format">{fileLabel}</span> : item.modality === "link" && !isLocalFile ? <LinkArtwork compact={compact} item={item} /> : <Icon size={compact ? 19 : 28} />}</span> : null}
  </div>;
}

function LinkArtwork({ compact = false, item, large = false }: { compact?: boolean; item: SourceItem; large?: boolean }) { return <span className={`link-artwork ${compact ? "is-compact" : ""} ${large ? "is-large" : ""}`}>{item.faviconUrl ? <img src={item.faviconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}<span>{sourceLabel(item)}</span></span>; }

function TextArtwork({ item }: { item: SourceItem }) { const rawContent = item.contentText ?? item.metadata.description ?? item.itemTitle; const content = rawContent.trim() ? rawContent : item.itemTitle; return <span className={`text-artwork ${item.modality === "conversation" ? "is-chat" : ""}`}><MarkdownContent compact value={content} /></span>; }

function MarkdownContent({ compact = false, value }: { compact?: boolean; value: string }) { return <div className="markdown-content"><ReactMarkdown components={compact ? { img: () => null } : undefined} skipHtml>{value}</ReactMarkdown></div>; }

function MarkdownContentEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const editorRef = useRef<HTMLDivElement>(null);
  const save = () => {
    const html = editorRef.current?.innerHTML;
    if (html === undefined) return;
    const markdown = markdownSerializer.turndown(html).trimEnd();
    if (markdown !== value) onSave(markdown);
  };
  return <section className="source-item-content-preview markdown-content-preview"><div aria-label={copy.markdownContent} className="markdown-render-editor" contentEditable onBlur={save} ref={editorRef} role="textbox" suppressContentEditableWarning><MarkdownContent value={value} /></div></section>;
}

function hasRenderableThumbnail(item: SourceItem) {
  if (!item.thumbnailUrl) return false;
  if (item.modality === "audio") return Boolean(item.metadata.mediaPreviewUrl);
  if (item.modality === "video") return Boolean(item.metadata.mediaPreviewUrl) || item.assetCacheState === "cached";
  return item.modality === "image" || (item.modality === "link" && item.pickType !== "local_import");
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
function TypeBadge({ fileSize, mimeType, modality, pickType }: { fileSize?: number | null; mimeType?: string | null; modality: Modality; pickType?: string }) { const language = useLanguage(); const copy = interfaceCopy[language]; const localFile = modality === "file" || pickType === "local_import" && modality === "link"; const details = mimeType || fileSize !== null && fileSize !== undefined ? `${fileFormat(mimeType ?? null).toUpperCase()}｜${formatBytes(fileSize ?? null, language)}` : undefined; return <span className={`type-badge ${localFile ? "file" : modality === "image" ? "violet" : modality === "conversation" ? "green" : modality === "video" ? "rose" : modality === "audio" ? "amber" : "blue"}`} data-tooltip={details}>{localFile ? copy.file : kindLabel(modality, language)}</span>; }
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
  return <div className="source-item-filter-popover"><div className="filter-popover-head"><strong>{copy.filter}</strong><button disabled={!filtered} onClick={onReset} type="button">{labels.reset}</button></div><section className="filter-section"><h2>{labels.time}</h2><div className="filter-row">{dates.map((entry) => <button aria-pressed={dateFilter === entry.id} className="filter-chip" key={entry.id} onClick={() => onDateFilterChange(entry.id)} type="button">{entry.label}</button>)}</div>{dateFilter === "custom" ? <div className="date-range-row"><input aria-label={labels.start} type="date" value={dateStart} onChange={(event) => onDateStartChange(event.target.value)} /><input aria-label={labels.end} type="date" value={dateEnd} onChange={(event) => onDateEndChange(event.target.value)} /></div> : null}</section><section className="filter-section"><h2>{labels.type}</h2><div className="filter-row">{(["image", "text", "video", "audio", "file", "link", "conversation"] as const).map((entry) => <button aria-pressed={kind.includes(entry)} className="filter-chip" key={entry} onClick={() => onKindChange(entry)} type="button">{kindLabel(entry, language)}</button>)}</div></section><section className="filter-section"><h2>{labels.link}</h2><div className="filter-row">{links.map((entry) => <button aria-pressed={linkFilter.includes(entry.id)} className="filter-chip" key={entry.id} onClick={() => onLinkFilterChange(entry.id)} type="button">{entry.label}</button>)}</div></section><section className="filter-section"><h2>{labels.local}</h2><div className="filter-row">{locals.map((entry) => <button aria-pressed={localFilter.includes(entry.id)} className="filter-chip" key={entry.id} onClick={() => onLocalFilterChange(entry.id)} type="button">{entry.label}</button>)}</div></section><section className="filter-section source-filter-section"><h2>{labels.source}</h2><div className="filter-row">{sourceOptions.map((entry) => <button aria-pressed={source.includes(entry)} className="filter-chip" key={entry} onClick={() => onSourceChange(entry)} type="button">{entry}</button>)}</div></section></div>;
}

function SourceDetailModal({ item, isSelected, onClose, onContentSave, onCopy, onDelete, onFavorite, onNoteSave, onOpenLocal, onPreview, onRequestDownload, onRetryDownload, onRevealLocal, onSelect, onTitleSave }: { item: SourceItem | null; isSelected: boolean; onClose: () => void; onContentSave: (id: string, value: string) => void; onCopy: (item: SourceItem) => Promise<void>; onDelete: (id: string) => void; onFavorite: (id: string, favorite: boolean) => void; onNoteSave: (id: string, value: string) => void; onOpenLocal: (item: SourceItem) => void; onPreview: (item: SourceItem) => void; onRequestDownload: (item: SourceItem) => void; onRetryDownload: (item: SourceItem) => void; onRevealLocal: (item: SourceItem) => void; onSelect: (id: string) => void; onTitleSave: (id: string, value: string) => Promise<boolean> }) {
  const language = useLanguage(); const copy = interfaceCopy[language];
  const [draftTitle, setDraftTitle] = useState(item?.itemTitle ?? "");
  const [draftNote, setDraftNote] = useState(item?.userNote ?? "");
  const [draftContent, setDraftContent] = useState(item?.contentText ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  useEffect(() => { setDraftTitle(item?.itemTitle ?? ""); setDraftNote(item?.userNote ?? ""); setDraftContent(item?.contentText ?? ""); setConfirmDelete(false); setIsEditingTitle(false); }, [item?.id, item?.itemTitle, item?.userNote, item?.contentText]);
  if (!item) return null;
  const page = item.modality === "link" && item.pickType !== "local_import";
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
        <div className="detail-resource-header"><div className="detail-resource-main"><div className="detail-title-control">{isEditingTitle ? <><input autoFocus aria-label={copy.sourceTitle} className="detail-title-input" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(); if (event.key === "Escape") cancelTitleEdit(); }} /><div className="detail-title-actions"><button aria-label={copy.saveTitle} className="detail-title-action is-confirm" data-tooltip={copy.save} disabled={!draftTitle.trim()} onClick={() => void saveTitle()} type="button"><Check size={14} /></button><button aria-label={copy.cancelTitleEdit} className="detail-title-action" data-tooltip={copy.cancel} onClick={cancelTitleEdit} type="button"><X size={14} /></button></div></> : <><h2 className="detail-title-value" title={item.itemTitle}>{item.itemTitle}</h2><button aria-label={copy.editTitle} className="detail-title-action" data-tooltip={copy.editTitle} onClick={() => setIsEditingTitle(true)} type="button"><Pencil size={14} /></button></>}<button className={`favorite-star detail-favorite-button ${item.favorite ? "active" : ""}`} aria-label={item.favorite ? copy.removeFavorite : copy.addFavorite} aria-pressed={item.favorite} data-tooltip={item.favorite ? copy.removeFavorite : copy.addFavorite} onClick={() => void onFavorite(item.id, !item.favorite)} type="button"><Star size={15} fill={item.favorite ? "currentColor" : "none"} /></button></div></div></div>
        {page ? <WebPageDetailPreview item={item} /> : null}
        {!page && item.modality === "image" && item.thumbnailUrl ? <figure className="detail-media-preview" role="button" tabIndex={0} onClick={() => onPreview(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onPreview(item); }}><img src={item.thumbnailUrl} alt={item.itemTitle} /></figure> : null}
        {!page && webVideo && item.thumbnailUrl ? <button aria-label="Open link in browser" className="detail-media-preview detail-web-video-preview" onClick={() => openWebLink(item)} type="button"><img src={item.thumbnailUrl} alt={item.itemTitle} /></button> : null}
        {!page && webVideo && !item.thumbnailUrl ? <WebPageDetailPreview item={item} /> : null}
        {!page && !webVideo && item.modality === "video" && (item.contentUrl || item.thumbnailUrl) ? <figure className="detail-media-preview"><video controls muted playsInline preload="metadata" src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /></figure> : null}
        {!page && item.modality === "audio" && (item.contentUrl || item.thumbnailUrl) ? <figure className="detail-audio-preview"><audio controls autoPlay preload="metadata" src={item.contentUrl ?? item.thumbnailUrl ?? undefined} /></figure> : null}
        {(item.modality === "text" || item.modality === "conversation") && item.contentText !== null ? <MarkdownContentEditor onSave={(value) => { setDraftContent(value); onContentSave(item.id, value); }} value={draftContent} /> : null}
        {!page && item.modality === "file" && storedFileState === "cached" ? <LocalFileDetailPreview item={item} onOpen={() => onOpenLocal(item)} /> : null}
        <div className="detail-primary-edit"><section className="description-editor"><div className="description-editor-heading"><span className="field-label-row">{copy.note} <span className="info-tooltip" data-tooltip={copy.noteHelp}><CircleHelp size={12} /></span></span></div><textarea aria-label={copy.note} placeholder={copy.addContext} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} onBlur={saveNote} /></section></div>
        <section className="inspector-section">
          <h3>{copy.info}</h3>
          <div className="field-grid">
            <DetailRow label={copy.source} value={sourceLabel(item)} />
            <DetailRow label={copy.picked} value={formatDateTime(item.pickedAt)} />
            {!page ? <><DetailRow label={copy.format} value={item.mimeType ?? kindLabel(item.modality, language)} /><DetailRow label={copy.size} value={formatBytes(item.fileSize, language)} /></> : null}
            {storedFileState === "cached" && item.localPath ? <DetailActionRow label={copy.localLink} onClick={() => onRevealLocal(item)} title={copy.showInFolder} value={item.localPath} /> : null}
            {(storedFileState === "missing" || storedFileState === "failed") && webLink ? <DetailActionRow icon={<Download size={13} />} label={copy.localLink} onClick={() => onRetryDownload(item)} title={copy.downloadAgain} value={copy.downloadAgain} /> : null}
            {storedFileState === "downloading" ? <DetailRow label={copy.localLink} value={copy.downloading} /> : null}
            {webLink ? <DetailRow hideLinkIcon label={copy.webLink} link value={webLink} /> : null}
          </div>
          {item.modality === "image" && Boolean(item.contentUrl) && localState(item) === "pending" ? <div className="detail-source-actions"><button className="secondary-button" onClick={() => onRequestDownload(item)} type="button"><Download size={14} />{copy.downloadLocalFile}</button></div> : null}
        </section>
      </div>
      <footer className="inspector-footer"><div className="inspector-footer-actions">{confirmDelete ? <><button className="text-button" onClick={() => setConfirmDelete(false)} type="button">{copy.cancel}</button><button className="danger-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} />{copy.confirmDelete}</button></> : <><button className="danger-outline-button inspector-delete" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={15} />{copy.delete}</button><button className="secondary-button inspector-copy-button" onClick={() => void onCopy(item)} type="button"><Copy size={15} />{copyAction}</button><button className="primary-button inspector-select-button" onClick={() => onSelect(item.id)} type="button">{isSelected ? <Check size={15} /> : <Square size={15} />}{isSelected ? copy.unselect : copy.select}</button></>}</div></footer>
    </aside>
  </div>;
}

function DetailRow({ hideLinkIcon = false, label, link = false, value }: { hideLinkIcon?: boolean; label: string; link?: boolean; value: string }) { return <div className="field"><span>{label}</span>{link ? <strong><a href={value} rel="noreferrer" target="_blank" title={value}>{value}{!hideLinkIcon ? <ExternalLink size={12} /> : null}</a></strong> : <strong title={value}>{value}</strong>}</div>; }
function DetailActionRow({ icon, label, onClick, title, value }: { icon?: React.ReactNode; label: string; onClick: () => void; title: string; value: string }) { return <div className="field"><span>{label}</span><button className="detail-path-action" data-tooltip={title} onClick={onClick} type="button"><span>{value}</span>{icon}</button></div>; }
function LocalFileDetailPreview({ item, onOpen }: { item: SourceItem; onOpen: () => void }) { return <button aria-label="Open file" className="detail-local-file-preview" onClick={onOpen} type="button"><SourceThumbnail item={item} /></button>; }
function WebPageDetailPreview({ item }: { item: SourceItem }) { const title = item.metadata.pageTitle || item.metadata.ogTitle || item.itemTitle; return <button aria-label="Open link in browser" className="webpage-detail-preview" onClick={() => openWebLink(item)} type="button"><div className="webpage-detail-copy"><div className="webpage-site-line">{item.faviconUrl ? <img src={item.faviconUrl} alt="" /> : null}<span>{sourceLabel(item)}</span></div><h3>{title}</h3>{item.metadata.description ? <p>{item.metadata.description}</p> : null}</div></button>; }
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

function CreateBookModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const copy = interfaceCopy[useLanguage()];
  const [name, setName] = useState("");
  useEffect(() => { if (isOpen) setName(""); }, [isOpen]);
  if (!isOpen) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="export-modal compact-book-modal" role="dialog" aria-modal="true" aria-label={copy.newBook}><header className="modal-head"><h2>{copy.newBook}</h2><button aria-label={copy.close} className="icon-button" data-tooltip={copy.close} onClick={onClose} type="button"><X size={16} /></button></header><div className="book-modal-body"><label>{copy.bookName}<input autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) onCreate(name); }} placeholder={useLanguage() === "en" ? "For example, Brand references" : "例如：品牌参考"} value={name} /></label><p>{useLanguage() === "en" ? "Sources and local files stay separate from your other Books." : "素材和本地文件将与其他 Book 保持独立。"}</p></div><footer className="modal-footer"><button className="text-button" onClick={onClose} type="button">{copy.cancel}</button><button className="primary-button" disabled={!name.trim()} onClick={() => onCreate(name)} type="button"><Plus size={15} />{copy.createBook}</button></footer></section></div>;
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
    materials: "复制文件",
    prompt: "复制提示词",
    localFiles: "个文件可直接粘贴。",
    linkReferences: "个没有本地文件的素材会作为链接写入提示词。",
  } : {
    materials: "Copy files",
    prompt: "Copy prompt",
    localFiles: ` file${copyableFiles === 1 ? "" : "s"} can be pasted directly.`,
    linkReferences: ` source${linkReferences === 1 ? "" : "s"} without a local file will be included as links in the prompt.`,
  };
  return <div className="pack-popover" role="dialog" aria-label={language === "zh" ? "发送给 Agent" : "Pack for agent"}>
    <button aria-label={language === "zh" ? "关闭" : "Close"} className="pack-popover-close icon-button" data-tooltip={language === "zh" ? "关闭" : "Close"} onClick={onClose} type="button"><X size={14} /></button>
    <div className="pack-popover-header"><h2>Copy to Clipboard</h2><p>then paste it into your agent chat.</p></div>
    <ul className="pack-popover-summary"><li><strong>{copyableFiles}</strong>{copy.localFiles}</li><li><strong>{linkReferences}</strong>{copy.linkReferences}</li></ul>
    <div className="pack-popover-actions">
      <button className="primary-button" disabled={copyableFiles === 0} onClick={() => void onCopyMaterials()} type="button"><Package size={14} />{copy.materials}</button>
      <button className="primary-button" onClick={() => void onCopyPrompt()} type="button"><FileText size={14} />{copy.prompt}</button>
    </div>
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
function descriptionFor(item: SourceItem) { if (item.modality === "image" || item.modality === "video") return ""; return (item.metadata.description || item.userNote || item.contentText || "").replace(/\s+/g, " ").trim().slice(0, 360); }
function sourceLabel(item: SourceItem) { return item.metadata.siteName || item.sourceTitle || item.sourceOrigin || "Browser"; }
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
function localState(item: SourceItem): LocalFilter { if (item.modality === "text" || item.modality === "conversation") return "all"; if (item.assetCacheState === "downloading") return "downloading"; if (item.assetCacheState === "cached") return item.fileSize === null ? "missing" : "local"; if (item.assetCacheState === "missing" || item.status === "missing") return "missing"; if (item.assetCacheState === "failed" || item.status === "failed") return "failed"; return "pending"; }
function localFileState(item: SourceItem): LocalCopyState { if (!item.assetId) return null; if (item.assetCacheState === "cached" && item.fileSize === null) return "missing"; return item.assetCacheState; }
function webLinkFor(item: SourceItem) { return /^https?:\/\//i.test(item.sourceUrl) ? item.sourceUrl : null; }
function openWebLink(item: SourceItem) { const link = webLinkFor(item); if (link) window.open(link, "_blank", "noopener,noreferrer"); }
function buildPackPrompt(_template: PackTemplate, _values: Record<string, string>, items: SourceItem[], language: Language) {
  const en = language === "en";
  const files = items.filter(hasCopyablePackFile);
  const links = items.filter((item) => !hasCopyablePackFile(item) && Boolean(webLinkFor(item)));
  const fileSection = files.length ? [en ? "## Uploaded files" : "## 上传的文件", ...files.map((item, index) => `${index + 1}. \`${packFileName(item)}\`\n   - ${en ? "Note" : "备注"}: ${item.userNote.trim()}`)].join("\n") : "";
  const linkSection = links.length ? [en ? "## Links" : "## 链接", ...links.map((item, index) => `${index + 1}. ${webLinkFor(item)}\n   - ${en ? "Note" : "备注"}: ${item.userNote.trim()}`)].join("\n") : "";
  return [en ? "Use the uploaded files, the links below, and their notes as task context." : "请将上传的文件、以下链接及其备注作为任务上下文。", fileSection, linkSection].filter(Boolean).join("\n\n");
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
async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Request failed (${response.status})`); return response.json() as Promise<T>; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Try again."; }
