const CONTROL_TEXT_LABELS = new Set(
  [
    "copy",
    "copied",
    "复制",
    "已复制",
    "share",
    "分享",
    "retry",
    "regenerate",
    "重新生成",
    "重试",
    "like",
    "dislike",
    "赞",
    "踩",
    "more",
    "更多",
    "expand",
    "collapse",
    "展开",
    "收起",
    "edit",
    "编辑",
    "delete",
    "删除",
    "read aloud",
    "朗读"
  ].map(normalizeControlText)
);

export function compactMessageText(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function cleanChatText(value: string, strictNoiseFiltering = false): string {
  const lines = compactMessageText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned = lines.filter(
    (line) => !isChromeNoiseLine(line, strictNoiseFiltering) && !isControlTextLine(line)
  );
  return compactMessageText(cleaned.join("\n"));
}

export function isUsefulChatText(value: string, strictNoiseFiltering = false): boolean {
  const lines = compactMessageText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return false;
  if (strictNoiseFiltering && compactMessageText(value).length < 4) return false;
  if (!strictNoiseFiltering && compactMessageText(value).length < 2) return false;

  return lines.some((line) => !isChromeNoiseLine(line, strictNoiseFiltering) && !isControlTextLine(line));
}

export function isControlTextLine(line: string): boolean {
  const normalized = normalizeControlText(line);
  if (!normalized) return true;
  if (CONTROL_TEXT_LABELS.has(normalized)) return true;

  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length > 1 && tokens.length <= 3 && tokens.every((token) => CONTROL_TEXT_LABELS.has(token));
}

function isChromeNoiseLine(line: string, strictNoiseFiltering: boolean): boolean {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (!normalized) return true;

  if (/^(top|left|right|bottom|width|height|x|y)\s*[:=]\s*-?\d+(\.\d+)?(px)?$/i.test(normalized)) return true;
  if (/^(translate|translatex|translatey|scale|rotate|matrix|transform)\s*[:=]?\s*\(?[-\d., px%]+\)?$/i.test(normalized)) return true;
  if (/^--[\w-]+\s*:/.test(normalized)) return true;
  if (/^(style|class|classname)\s*=/.test(normalized.toLowerCase())) return true;
  if (/^\{?\s*["']?(x|y|top|left|right|bottom|width|height|style|className)["']?\s*:\s*/.test(normalized)) return true;
  if (
    /(^|;)\s*(top|left|right|bottom|width|height|transform|opacity|z-index|position|display|margin|padding)\s*:[^;]+;/.test(
      normalized
    )
  ) {
    return true;
  }

  if (!strictNoiseFiltering) return false;

  const cssTokenHits = normalized.match(
    /\b(absolute|relative|fixed|sticky|flex|grid|block|hidden|overflow|opacity|translate|rounded|shadow|border|bg-|text-|w-|h-|left-|right-|top-|bottom-|inset-|z-)\b/g
  );
  if (cssTokenHits && cssTokenHits.length >= 4 && normalized.length < 240) return true;
  if (/^-?\d+(\.\d+)?(px|rem|em|vh|vw|%)?(\s+-?\d+(\.\d+)?(px|rem|em|vh|vw|%)?){2,}$/.test(normalized)) return true;

  return false;
}

function normalizeControlText(value: string): string {
  return value
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
