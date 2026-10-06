import { useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, FileText, Image, Link2, LoaderCircle, MessageSquareText, Package, RefreshCw, Trash2, Video } from "lucide-react";

type SourceItem = {
  id: string;
  captureTitle: string;
  userNote: string;
  status: string;
  capturedAt: string;
  modality: "text" | "image" | "video" | "link" | "page" | "conversation";
  contentText: string | null;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourceOrigin: string;
  faviconUrl: string | null;
  metadata: { description?: string; siteName?: string; canonicalUrl?: string };
};

type SourcePack = {
  id: string;
  name: string;
  prompt: string;
  inboxItemIds: string[];
  files: string[];
  warnings: string[];
};

const kindCopy: Record<SourceItem["modality"], string> = {
  text: "文字",
  image: "图片",
  video: "视频",
  link: "链接",
  page: "网页",
  conversation: "对话",
};

const kindIcon = {
  text: FileText,
  image: Image,
  video: Video,
  link: Link2,
  page: Link2,
  conversation: MessageSquareText,
} satisfies Record<SourceItem["modality"], typeof FileText>;

export default function SourcebookWorkspace() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("请使用附带的素材作为上下文完成任务。");
  const [loading, setLoading] = useState(true);
  const [packing, setPacking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [latestPack, setLatestPack] = useState<SourcePack | null>(null);

  const selectedCount = selectedIds.length;
  const selectedItems = useMemo(() => new Set(selectedIds), [selectedIds]);

  async function loadItems() {
    setLoading(true);
    try {
      const response = await request<{ items: SourceItem[] }>("/api/inbox/items");
      setItems(response.items);
      setSelectedIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
      setMessage(null);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    try {
      await request("/api/inbox/items", { method: "DELETE", body: JSON.stringify({ inboxItemIds: selectedIds }) });
      setMessage(`已删除 ${selectedIds.length} 个素材`);
      await loadItems();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function createPack() {
    if (selectedIds.length === 0) return;
    setPacking(true);
    try {
      const response = await request<{ sourcePack: SourcePack }>("/api/source-packs", {
        method: "POST",
        body: JSON.stringify({ inboxItemIds: selectedIds, prompt }),
      });
      setLatestPack(response.sourcePack);
      setMessage(`已打包 ${selectedIds.length} 个素材`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPacking(false);
    }
  }

  return (
    <main className="p1-shell">
      <header className="p1-header">
        <div>
          <h1>Sourcebook for Agents</h1>
          <p className="p1-product-subtitle">素材</p>
        </div>
        <div className="p1-header-actions">
          <span>{items.length} 个素材</span>
          <button className="p1-icon-button" onClick={() => void loadItems()} title="刷新素材" aria-label="刷新素材" disabled={loading}>
            <RefreshCw size={16} className={loading ? "p1-spin" : undefined} />
          </button>
        </div>
      </header>

      <section className="p1-content">
        <div className="p1-sources" aria-label="素材列表">
          {loading ? <div className="p1-empty"><LoaderCircle className="p1-spin" size={20} />正在读取本地素材</div> : null}
          {!loading && items.length === 0 ? <div className="p1-empty"><Package size={24} /><strong>还没有素材</strong><span>在网页中使用 Picker 保存内容后，素材会自动出现于此。</span></div> : null}
          {!loading && items.map((item) => <SourceCard key={item.id} item={item} selected={selectedItems.has(item.id)} onToggle={() => toggleSelected(item.id)} />)}
        </div>

        <aside className="p1-pack-panel">
          <div className="p1-pack-heading">
            <div className="p1-pack-icon"><Package size={18} /></div>
            <div><h2>Pack</h2><p>整理后发送给 Agent</p></div>
          </div>
          <label className="p1-field-label" htmlFor="pack-prompt">任务说明</label>
          <textarea id="pack-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
          <div className="p1-selection-line"><span>已选 {selectedCount} 个素材</span>{selectedCount > 0 ? <button onClick={() => setSelectedIds([])}>清除选择</button> : null}</div>
          <button className="p1-primary-button" onClick={() => void createPack()} disabled={selectedCount === 0 || packing}>
            {packing ? <LoaderCircle className="p1-spin" size={16} /> : <Package size={16} />}{packing ? "正在打包" : "创建 Pack"}
          </button>
          {selectedCount > 0 ? <button className="p1-danger-button" onClick={() => void removeSelected()}><Trash2 size={15} />删除所选</button> : null}

          {latestPack ? <div className="p1-pack-result"><div><Check size={16} /><strong>Pack 已就绪</strong></div><p>{latestPack.files.length} 个文件已准备好{latestPack.warnings.length ? `，${latestPack.warnings.length} 条提醒` : ""}</p><a href={`/api/source-packs/${latestPack.id}/download`} download><Download size={15} />下载 ZIP</a></div> : null}
          {message ? <p className="p1-message" role="status">{message}</p> : null}
        </aside>
      </section>
    </main>
  );
}

function SourceCard({ item, selected, onToggle }: { item: SourceItem; selected: boolean; onToggle: () => void }) {
  const Icon = kindIcon[item.modality];
  const description = item.metadata.description || item.userNote || item.contentText?.replace(/\s+/g, " ").slice(0, 160) || item.contentUrl || "";
  const thumb = item.modality === "image" ? item.thumbnailUrl : null;
  return <article className={`p1-source-card${selected ? " is-selected" : ""}`}>
    <button className="p1-select-control" onClick={onToggle} aria-label={selected ? `取消选择 ${item.captureTitle}` : `选择 ${item.captureTitle}`} aria-pressed={selected}>{selected ? <Check size={15} /> : null}</button>
    {thumb ? <img className="p1-source-image" src={thumb} alt="" /> : <div className="p1-source-icon"><Icon size={20} /></div>}
    <div className="p1-source-body">
      <div className="p1-source-meta"><span>{kindCopy[item.modality]}</span><time>{formatDate(item.capturedAt)}</time></div>
      <h2>{item.captureTitle}</h2>
      {description ? <p>{description}</p> : null}
      <footer><span>{item.metadata.siteName || item.sourceTitle || item.sourceOrigin}</span><a href={item.sourceUrl} target="_blank" rel="noreferrer" title="打开原始网页"><ExternalLink size={14} /></a></footer>
    </div>
  </article>;
}

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，请重试";
}
