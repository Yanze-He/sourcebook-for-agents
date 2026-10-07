export function isEditableTarget(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return false;

  const editable = element.closest<HTMLElement>(
    'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'
  );
  if (!editable) return false;

  if (editable instanceof HTMLInputElement) {
    return editable.type === "password" || editable.type === "email" || editable.type === "text";
  }

  return true;
}

export function isSensitivePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    return /(^|\.)((bank|paypal|1password|bitwarden|lastpass|dashlane|okta|auth0)\.)/i.test(parsed.hostname);
  } catch {
    return true;
  }
}

export function cssPath(element: Element | null): string | undefined {
  if (!element || element === document.documentElement) return undefined;

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const id = current.id && /^[A-Za-z][\w-]*$/.test(current.id) ? `#${CSS.escape(current.id)}` : "";
    if (id) {
      segments.unshift(`${tag}${id}`);
      break;
    }

    const parent: HTMLElement | Element | null = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children).filter((child: Element) => child.tagName === current?.tagName);
    const index = siblings.indexOf(current) + 1;
    segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }

  return segments.length ? segments.join(" > ") : undefined;
}

export function textPositionInBody(exact: string): { start: number; end: number } | undefined {
  const haystack = document.body?.innerText;
  if (!haystack || !exact) return undefined;

  const start = haystack.indexOf(exact);
  if (start < 0) return undefined;
  return { start, end: start + exact.length };
}

export function quoteWithContext(exact: string): { exact: string; prefix?: string; suffix?: string } {
  const haystack = document.body?.innerText || "";
  const index = haystack.indexOf(exact);
  if (index < 0) return { exact };

  return {
    exact,
    prefix: haystack.slice(Math.max(0, index - 80), index).trim() || undefined,
    suffix: haystack.slice(index + exact.length, index + exact.length + 80).trim() || undefined
  };
}
