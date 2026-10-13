import type { PostAuthor, PostMedia, PostPlatform, PostSnapshot } from "../shared/types";

type PostDetection = { platform: PostPlatform; post: PostSnapshot; thumbnailUrl?: string; thumbnailCandidates?: string[] };

export function detectPost(documentRef: Document = document, href: string = location.href): PostDetection | null {
  const hostname = safeUrl(href)?.hostname.toLowerCase() || "";
  if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) return extractXPost(documentRef, href);
  if (hostname === "xiaohongshu.com" || hostname.endsWith(".xiaohongshu.com")) return extractXiaohongshuPost(documentRef, href);
  return null;
}

function extractXPost(root: Document, href: string): PostDetection | null {
  const parsed = safeUrl(href);
  const match = parsed?.pathname.match(/(?:^|\/)status\/(\d+)/);
  if (!match) return null;
  const article = root.querySelector<HTMLElement>('article[data-testid="tweet"]') || root.querySelector<HTMLElement>("article");
  const textNode = article?.querySelector<HTMLElement>('[data-testid="tweetText"]');
  const userNode = article?.querySelector<HTMLElement>('[data-testid="User-Name"]');
  const timestamp = article?.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime;
  const author = xAuthor(userNode);
  const media = uniqueMedia([
    ...Array.from(article?.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img') || []).map((image) => ({ kind: "image" as const, sourceUrl: imageCandidates(image, href)[0], altText: image.alt || undefined })),
    ...Array.from(article?.querySelectorAll<HTMLVideoElement>("video") || []).map((video) => ({ kind: "video" as const, sourceUrl: video.currentSrc || video.src || undefined, thumbnailUrl: video.poster || undefined }))
  ]);
  const bodyText = clean(textNode?.innerText || "");
  if (!bodyText && !media.length && !author?.displayName) return null;
  const tags = Array.from(article?.querySelectorAll<HTMLAnchorElement>('a[href*="/hashtag/"]') || []).map((link) => clean(link.textContent || "")).filter(Boolean);
  const metadataCover = metadataImage(root, href);
  const thumbnailCandidates = unique([...mediaThumbnailCandidates(media), ...(metadataCover ? [metadataCover] : [])]);
  return {
    platform: "x",
    thumbnailUrl: thumbnailCandidates[0],
    thumbnailCandidates,
    // The platform and raw media list are only needed while the picker is on
    // the page. Persist the compact post snapshot, not page implementation data.
    post: { schemaVersion: 1, bodyText, author, publishedAt: timestamp || undefined, tags: unique(tags) }
  };
}

function extractXiaohongshuPost(root: Document, href: string): PostDetection | null {
  const parsed = safeUrl(href);
  const match = parsed?.pathname.match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const detail = root.querySelector<HTMLElement>("#detail-desc, #noteContainer, [class*='note-detail'], [class*='noteDetail']") || root.body;
  const title = clean(firstText(detail, [".title", "[class*='title']", "h1"]));
  const bodyText = clean(firstText(detail, [".desc", "[class*='desc']", "[class*='content']", "[class*='note-text']"])) || clean(detail.innerText || "");
  const authorNode = root.querySelector<HTMLElement>("#detail-desc [class*='author'], #noteContainer [class*='author'], [class*='author-wrapper']");
  const author = xiaohongshuAuthor(authorNode);
  const mediaScope = root.querySelector<HTMLElement>("#noteContainer, [class*='note-slider'], [class*='media-container']") || detail;
  // A note container also includes author controls. Never let those avatar images
  // enter the preview chain: the visual anchor must be note media or a video cover.
  const candidateImages = uniqueElements([
    ...Array.from(mediaScope.querySelectorAll<HTMLImageElement>("img")).filter((image) => isLikelyXiaohongshuMedia(image, href)),
    ...Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter((image) => isLikelyXiaohongshuMedia(image, href))
  ]);
  const videoNodes = uniqueElements([
    ...Array.from(mediaScope.querySelectorAll<HTMLElement>("video, [data-video], [data-video-url], [data-poster], [data-cover], [data-cover-url], [data-video-cover], [data-first-frame], [class*='video']")).filter(isLikelyXiaohongshuVideo),
    ...Array.from(root.querySelectorAll<HTMLElement>("video, [data-video], [data-video-url], [data-poster], [data-cover], [data-cover-url], [data-video-cover], [data-first-frame], [class*='video']")).filter(isLikelyXiaohongshuVideo)
  ]);
  const media = uniqueMedia([
    ...videoNodes.map((video) => ({ kind: "video" as const, sourceUrl: videoSourceUrl(video, href), thumbnailUrl: videoCoverCandidates(video, href)[0] })),
    ...candidateImages
      .map((image) => imageCandidates(image, href)[0])
      .filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl))
      .map((sourceUrl) => ({ kind: "image" as const, sourceUrl })),
  ]);
  if (!title && !bodyText && !media.length) return null;
  const tags = Array.from(detail.querySelectorAll<HTMLAnchorElement>("a")).map((link) => clean(link.textContent || "")).filter((value) => value.startsWith("#"));
  const metadataCover = metadataImage(root, href);
  const thumbnailCandidates = unique([
    ...videoNodes.flatMap((video) => videoCoverCandidates(video, href)),
    ...serializedXiaohongshuVideoCoverCandidates(root, href),
    ...mediaThumbnailCandidates(media),
    ...candidateImages.flatMap((image) => imageCandidates(image, href)),
    ...backgroundImageCandidates(mediaScope, href),
    ...backgroundImageCandidates(root, href),
    ...(metadataCover && !isAvatarUrl(metadataCover) ? [metadataCover] : [])
  ]).filter((value) => !value.startsWith("blob:"));
  return {
    platform: "xiaohongshu",
    thumbnailUrl: thumbnailCandidates[0],
    thumbnailCandidates,
    post: { schemaVersion: 1, title: title || undefined, bodyText, author, tags: unique(tags) }
  };
}

function xAuthor(node: HTMLElement | null | undefined): PostAuthor | undefined {
  const values = clean(node?.innerText || "").split("\n").map(clean).filter(Boolean);
  const handle = values.find((value) => value.startsWith("@"));
  return values.length ? { displayName: values.find((value) => value !== handle), handle } : undefined;
}

function xiaohongshuAuthor(node: HTMLElement | null | undefined): PostAuthor | undefined {
  const displayName = clean(node?.innerText || "").split("\n").map(clean).find(Boolean);
  return displayName ? { displayName } : undefined;
}

function firstText(root: ParentNode, selectors: string[]) { return selectors.map((selector) => root.querySelector<HTMLElement>(selector)?.innerText || "").find((value) => clean(value)) || ""; }
function safeUrl(value: string) { try { return new URL(value); } catch { return undefined; } }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function unique(values: string[]) { return Array.from(new Set(values)); }
function uniqueMedia(media: PostMedia[]) { return media.filter((item, index, values) => Boolean(item.sourceUrl || item.thumbnailUrl) && values.findIndex((candidate) => candidate.sourceUrl === item.sourceUrl && candidate.thumbnailUrl === item.thumbnailUrl) === index); }
function mediaThumbnailCandidates(media: PostMedia[]) { return unique(media.flatMap((item) => item.kind === "video" ? [item.thumbnailUrl] : [item.sourceUrl, item.thumbnailUrl]).filter(isUsableImageUrl)); }
function absoluteUrl(value: string | null | undefined, href: string) { try { return value ? new URL(value, href).href : undefined; } catch { return undefined; } }
function imageCandidates(image: HTMLImageElement, href: string) {
  const srcset = [image.currentSrc, image.srcset, image.getAttribute("data-srcset")].filter(Boolean).flatMap((value) => String(value).split(",").map((entry) => entry.trim().split(/\s+/)[0]));
  return unique([image.currentSrc, image.src, image.getAttribute("data-src"), image.getAttribute("data-original"), image.getAttribute("data-origin"), image.getAttribute("data-url"), ...srcset].map((value) => absoluteUrl(value, href)).filter(isUsableImageUrl));
}
function backgroundImageCandidates(root: ParentNode, href: string) {
  const rootElement = root.nodeType === 1 ? [root as HTMLElement] : [];
  const elements = uniqueElements([...rootElement, ...Array.from(root.querySelectorAll<HTMLElement>("[style*='background'], [class*='media'], [class*='video'], [class*='slider'], [class*='swiper']"))]).filter((element) => !isAvatarElement(element));
  return unique(elements.flatMap((element) => {
    const computed = typeof getComputedStyle === "function" ? getComputedStyle(element).backgroundImage : "";
    const urls = [element.style.backgroundImage, computed].flatMap((value) => Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map((match) => match[1]));
    return urls.map((value) => absoluteUrl(value, href)).filter(isUsableImageUrl);
  }));
}
function metadataImage(root: Document, href: string) {
  const value = ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]', 'meta[itemprop="image"]']
    .map((selector) => root.querySelector<HTMLMetaElement>(selector)?.content)
    .find(Boolean);
  return absoluteUrl(value, href);
}
function isLikelyXiaohongshuMedia(image: HTMLImageElement, href: string) {
  const candidates = imageCandidates(image, href);
  if (isAvatarElement(image) || candidates.some(isAvatarUrl)) return false;
  const context = elementContext(image);
  const width = Math.max(image.naturalWidth || 0, image.width || 0, Number(image.getAttribute("width")) || 0);
  const height = Math.max(image.naturalHeight || 0, image.height || 0, Number(image.getAttribute("height")) || 0);
  return /note|media|slider|swiper|gallery|carousel|image|video/.test(context) || Math.max(width, height) > 180 || candidates.some((value) => /xhscdn|xiaohongshu|sns-img|note-image/i.test(value));
}

function isLikelyXiaohongshuVideo(element: HTMLElement) {
  if (isAvatarElement(element)) return false;
  return element.tagName === "VIDEO" || /video|media|slider|swiper|gallery|carousel/.test(elementContext(element));
}

function videoCoverCandidates(element: HTMLElement, href: string) {
  const attributes = ["poster", "data-poster", "data-cover", "data-cover-url", "data-cover-image", "data-cover-url-pre", "data-cover-url-default", "data-video-cover", "data-image", "data-image-url", "data-thumbnail", "data-thumbnail-url", "data-first-frame", "data-first-frame-url", "data-url-pre", "data-url-default"];
  const nestedImages = Array.from(element.querySelectorAll<HTMLImageElement>("img")).filter((image) => !isAvatarElement(image)).flatMap((image) => imageCandidates(image, href));
  const styledDescendants = [element, ...Array.from(element.querySelectorAll<HTMLElement>("[style*='background'], [class*='cover'], [class*='poster'], [class*='frame']"))]
    .filter((candidate) => !isAvatarElement(candidate))
    .flatMap((candidate) => inlineBackgroundImageCandidates(candidate, href));
  const values = attributes.map((attribute) => element.getAttribute(attribute));
  return unique([...values.map((value) => absoluteUrl(value, href)).filter(isUsableImageUrl), ...nestedImages, ...styledDescendants]);
}

function serializedXiaohongshuVideoCoverCandidates(root: Document, href: string) {
  const values: string[] = [];
  const directCover = /"(?:poster|cover(?:Url|Image|UrlPre|UrlDefault)?|firstFrame(?:Url)?|first_frame|thumbnail(?:Url)?|videoCover|video_cover|urlPre|urlDefault|imageUrl)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  const nestedCover = /"(?:poster|cover(?:Url|Image|UrlPre|UrlDefault)?|firstFrame(?:Url)?|first_frame|thumbnail(?:Url)?|videoCover|video_cover|image)"\s*:\s*\{[\s\S]{0,700}?"(?:url|urlPre|urlDefault|urlDefaultWebp|urlPreWebp)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  for (const script of Array.from(root.querySelectorAll<HTMLScriptElement>("script"))) {
    const source = script.textContent || "";
    if (!/video|firstFrame|videoCover|videoInfo|playUrl/i.test(source)) continue;
    for (const match of source.matchAll(directCover)) {
      if (match[1]) values.push(decodeSerializedUrl(match[1]));
    }
    for (const match of source.matchAll(nestedCover)) {
      if (match[1]) values.push(decodeSerializedUrl(match[1]));
    }
  }
  return unique(values.map((value) => absoluteUrl(value, href)).filter(isUsableImageUrl));
}

function inlineBackgroundImageCandidates(element: HTMLElement, href: string) {
  return Array.from(element.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map((match) => absoluteUrl(match[1], href)).filter(isUsableImageUrl);
}

function videoSourceUrl(element: HTMLElement, href: string) {
  const nestedSource = element.querySelector<HTMLSourceElement>("source[src]")?.src;
  const value = element.getAttribute("src") || element.getAttribute("data-video-url") || element.getAttribute("data-play-url") || nestedSource;
  return absoluteUrl(value, href);
}

function uniqueElements<T extends Element>(elements: T[]) { return Array.from(new Set(elements)); }
function elementContext(element: Element) {
  const values: string[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) values.push(`${current.id || ""} ${current.getAttribute("class") || ""} ${current.getAttribute("data-testid") || ""}`);
  return values.join(" ").toLowerCase();
}
function isAvatarElement(element: Element) { return /avatar|author|profile|user-head|user-info|creator/.test(elementContext(element)) || /avatar|profile|head|author|user/.test(element.getAttribute("alt") || ""); }
function isAvatarUrl(value: string) { return /(?:avatar|profile|head[_-]?img|user[_-]?icon|author[_-]?icon)/i.test(value); }
function isVideoUrl(value: string) { return /\.(?:mp4|m3u8|mov|webm)(?:$|[?#])/i.test(value); }
function isUsableImageUrl(value: string | undefined): value is string { return typeof value === "string" && value.length > 0 && !isAvatarUrl(value) && !isVideoUrl(value); }
function decodeSerializedUrl(value: string) { try { return JSON.parse(`"${value}"`) as string; } catch { return value.replace(/\\\//g, "/").replace(/\\u0026/g, "&"); } }
