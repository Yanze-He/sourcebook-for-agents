import type { PageMetadata } from "./types";

export function getMetaContent(selector: string, root: Document = document): string | undefined {
  return root.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;
}

function absoluteDocumentUrl(value: string | undefined, root: Document): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, root.location.href).href;
  } catch {
    return undefined;
  }
}

function previewImageUrl(root: Document): string | undefined {
  const metadataImage = [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
    'meta[itemprop="image"]',
    'meta[itemprop="thumbnailUrl"]',
    'link[rel="image_src"]'
  ].map((selector) => {
    const element = root.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
    return element instanceof HTMLLinkElement ? element.href?.trim() : element?.content?.trim();
  }).find(Boolean);
  if (metadataImage) return absoluteDocumentUrl(metadataImage, root);

  const image = root.querySelector<HTMLImageElement>(
    '#landingImage, [data-a-image-name="landingImage"] img, img[data-old-hires], main img[src]'
  );
  const candidate = image?.currentSrc || image?.getAttribute("data-old-hires") || image?.getAttribute("data-src") || image?.getAttribute("src");
  return absoluteDocumentUrl(candidate ?? undefined, root);
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
