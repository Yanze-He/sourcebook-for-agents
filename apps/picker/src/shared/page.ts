import type { PageMetadata } from "./types";

export function getMetaContent(selector: string, root: Document = document): string | undefined {
  return root.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;
}

function absoluteDocumentUrl(value: string | undefined, root: Document, baseUrl = root.location.href): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

function previewImageUrls(root: Document, baseUrl = root.location.href): string[] {
  const metadataImages = [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
    'meta[itemprop="image"]',
    'meta[itemprop="thumbnailUrl"]',
    'link[rel="image_src"]'
  ].map((selector) => {
    const element = root.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
    return element?.tagName === "LINK" ? (element as HTMLLinkElement).href?.trim() : (element as HTMLMetaElement | null)?.content?.trim();
  }).map((value) => absoluteDocumentUrl(value, root, baseUrl)).filter((value): value is string => Boolean(value));

  const image = root.querySelector<HTMLImageElement>(
    '#landingImage, [data-a-image-name="landingImage"] img, img[data-old-hires], main img[src]'
  );
  const candidate = image?.currentSrc || image?.getAttribute("data-old-hires") || image?.getAttribute("data-src") || image?.getAttribute("src");
  const pageImage = absoluteDocumentUrl(candidate ?? undefined, root, baseUrl);
  return uniqueCoverCandidates([...metadataImages, pageImage], baseUrl);
}

function previewImageUrl(root: Document): string | undefined {
  return previewImageUrls(root)[0];
}

// These are intentionally shared by every video picker. Platform players often
// keep the visible first frame on a wrapper rather than on the <video> itself.
const VIDEO_COVER_ATTRIBUTES = [
  "poster",
  "data-poster",
  "data-cover",
  "data-cover-url",
  "data-cover-image",
  "data-cover-url-pre",
  "data-cover-url-default",
  "data-video-cover",
  "data-image",
  "data-image-url",
  "data-thumbnail",
  "data-thumbnail-url",
  "data-first-frame",
  "data-first-frame-url",
  "data-url-pre",
  "data-url-default",
  "data-src",
  "data-original"
];

/**
 * Returns a stable, portable list of image candidates. Blob URLs and video files
 * are intentionally discarded because they cannot be used by the extension or
 * Desktop process after a pick leaves the current page.
 */
export function uniqueCoverCandidates(values: Array<string | undefined | null>, baseUrl?: string): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (!value?.trim()) return [];
    let url = value.trim();
    try {
      if (baseUrl) url = new URL(url, baseUrl).href;
    } catch {
      return [];
    }
    if (!/^https?:\/\//i.test(url) || /^(?:blob|data):/i.test(url) || /\.(?:mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

function attributeCoverCandidates(element: Element): string[] {
  const values = VIDEO_COVER_ATTRIBUTES.map((attribute) => element.getAttribute(attribute));
  const background = element.getAttribute("style")?.match(/background(?:-image)?\s*:\s*url\((['\"]?)(.*?)\1\)/i)?.[2];
  return [...values, background].filter((value): value is string => Boolean(value));
}

export function youtubeCoverCandidates(pageUrl: string): string[] {
  try {
    const url = new URL(pageUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoID = "";
    if (hostname === "youtu.be") videoID = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      videoID = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || "";
    }
    if (!/^[a-zA-Z0-9_-]{6,}$/.test(videoID)) return [];
    return ["maxresdefault", "hqdefault", "mqdefault", "default"].map((size) => `https://i.ytimg.com/vi/${videoID}/${size}.jpg`);
  } catch {
    return [];
  }
}

/**
 * Gather all cover sources exposed by a player before the pick is sent to the
 * background worker. Bilibili and Xiaohongshu commonly store them in player
 * data attributes, while YouTube has a deterministic public thumbnail endpoint.
 */
export function collectVideoCoverCandidates(video: HTMLVideoElement, root: Document = document, pageUrl = root.location.href): string[] {
  const playerElements: Element[] = [video];
  let parent = video.parentElement;
  for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) playerElements.push(parent);
  const playerCandidates = playerElements.flatMap(attributeCoverCandidates);
  const nearbyImages = playerElements.flatMap((element) => Array.from(element.querySelectorAll<HTMLImageElement>("img[src], img[data-src], img[data-original]"))
    .filter((image) => !/(?:avatar|author|profile)/i.test(`${image.className} ${image.alt}`))
    .map((image) => image.currentSrc || image.getAttribute("data-original") || image.getAttribute("data-src") || image.getAttribute("src")));

  return uniqueCoverCandidates([
    ...playerCandidates,
    ...previewImageUrls(root, pageUrl),
    ...nearbyImages,
    ...youtubeCoverCandidates(pageUrl)
  ], pageUrl);
}

export function getCanonicalUrl(root: Document = document): string | undefined {
  const href = root.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return href || undefined;
}

export function getFaviconUrl(root: Document = document): string | undefined {
  const icon =
    root.querySelector<HTMLLinkElement>('link[rel="icon"]') ||
    root.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]') ||
    root.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');

  if (!icon?.href) return undefined;
  try {
    return new URL(icon.href, root.location.href).href;
  } catch {
    return undefined;
  }
}

export function collectPageMetadata(root: Document = document, { includePreviewImage = true }: { includePreviewImage?: boolean } = {}): PageMetadata {
  const ogTitle = getMetaContent('meta[property="og:title"]', root);
  const description =
    getMetaContent('meta[name="description"]', root) ||
    getMetaContent('meta[property="og:description"]', root);
  return {
    pageTitle: ogTitle || getPageTitle(root),
    description: description?.slice(0, 240),
    canonicalUrl: getCanonicalUrl(root),
    ...(includePreviewImage ? { ogImage: previewImageUrl(root) } : {}),
    siteName: getMetaContent('meta[property="og:site_name"]', root)
  };
}

export function getSourceOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function getPageTitle(root: Document = document): string {
  return root.title?.trim() || root.location.hostname;
}
