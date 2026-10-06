import TurndownService from "turndown";
import { cssPath } from "../shared/selector";
import type { ChatMessageCandidate, ChatMessageRole, ChatProvider } from "../shared/types";
import { detectChatProvider } from "./recognizer";
import { cleanChatText, compactMessageText, isControlTextLine, isUsefulChatText } from "./text-cleaning";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-"
});

export function extractVisibleChat(documentRef: Document = document): {
  provider: ChatProvider;
  messages: ChatMessageCandidate[];
} | undefined {
  const provider = detectChatProvider(documentRef.location.href);
  if (!provider) return undefined;

  const messages = extractProviderMessages(provider, documentRef);
  if (messages.length) return { provider, messages };

  const fallback = extractMainFallback(provider, documentRef);
  return fallback.length ? { provider, messages: fallback } : { provider, messages: [] };
}

export function extractProviderMessages(provider: ChatProvider, documentRef: Document = document): ChatMessageCandidate[] {
  if (provider === "chatgpt") return extractChatGptMessages(documentRef);
  if (provider === "claude") return extractClaudeMessages(documentRef);
  if (provider === "gemini") return extractGeminiMessages(documentRef);
  if (provider === "kimi") return extractKimiMessages(documentRef);
  return extractGenericChatMessages(provider, documentRef);
}

export function extractChatMessageFromElement(
  provider: ChatProvider,
  target: Element,
  documentRef: Document = document
): ChatMessageCandidate | undefined {
  const element = findClosestMessageElement(provider, target, documentRef);
  if (!element) return undefined;

  return normalizeCandidates(
    provider,
    [
      {
        element,
        role: inferProviderRole(provider, element),
        order: Math.round((element.getBoundingClientRect().top + (documentRef.defaultView?.scrollY || 0)) * 1000)
      }
    ],
    provider === "kimi"
  )[0];
}

export function extractChatGptMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const elements = Array.from(documentRef.querySelectorAll<HTMLElement>("[data-message-author-role]"));

  return normalizeCandidates(
    "chatgpt",
    elements.map((element, order) => ({
      element,
      role: normalizeRole(element.getAttribute("data-message-author-role")),
      order
    }))
  );
}

export function extractClaudeMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const userMessages = Array.from(documentRef.querySelectorAll<HTMLElement>('[data-testid="user-message"]')).map(
    (element) => ({ element, role: "user" as ChatMessageRole })
  );

  const assistantMessages = Array.from(
    documentRef.querySelectorAll<HTMLElement>(
      '[data-testid="assistant-message"], [data-is-streaming], .font-claude-message, [class*="font-claude-message"]'
    )
  ).map((element) => ({ element, role: "assistant" as ChatMessageRole }));

  return normalizeCandidates(
    "claude",
    uniqueByElement([...userMessages, ...assistantMessages])
      .sort((a, b) => documentOrder(a.element, b.element))
      .map((candidate, order) => ({ ...candidate, order }))
  );
}

export function extractGeminiMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const selectors = [
    '[data-test-id="user-query"]',
    '[data-testid="user-query"]',
    ".user-query-container",
    ".query-text",
    "user-query",
    ".model-response-text",
    "model-response",
    "message-content",
    ".response-container"
  ];

  const elements = uniqueByElement(
    selectors.flatMap((selector) =>
      Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
        element,
        role: inferGeminiRole(element)
      }))
    )
  );

  return normalizeCandidates(
    "gemini",
    elements.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order }))
  );
}

export function extractKimiMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const container = documentRef.querySelector<HTMLElement>("#chat-container") || documentRef.querySelector<HTMLElement>("main") || documentRef.body;
  return extractGenericChatMessages("kimi", documentRef, container || undefined, true);
}

export function extractGenericChatMessages(
  provider: ChatProvider,
  documentRef: Document = document,
  scopedContainer?: HTMLElement,
  strictNoiseFiltering = false
): ChatMessageCandidate[] {
  const container = scopedContainer || documentRef.querySelector<HTMLElement>("main") || documentRef.body;
  if (!container) return [];

  const explicitSelectors = [
    "[data-message-author-role]",
    "[data-role]",
    "[role='article']",
    "[data-testid*='message' i]",
    "[data-testid*='conversation' i]",
    "[class*='message' i]",
    "[class*='chat' i]",
    "[class*='bubble' i]",
    "[class*='prose' i]",
    "[class*='markdown' i]",
    "[class*='segment' i]",
    "[class*='response' i]",
    "[class*='answer' i]",
    "[class*='query' i]"
  ];

  const explicit = uniqueByElement(
    explicitSelectors.flatMap((selector) =>
      Array.from(container.querySelectorAll<HTMLElement>(selector)).map((element) => ({
        element,
        role: inferGenericRole(element)
      }))
    )
  );

  const structural = findLeafTextBlocks(container).map((element) => ({
    element,
    role: inferGenericRole(element)
  }));

  const merged = uniqueByElement([...explicit, ...structural]);

  return normalizeCandidates(
    provider,
    merged.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order })),
    strictNoiseFiltering
  );
}

function extractMainFallback(provider: ChatProvider, documentRef: Document): ChatMessageCandidate[] {
  const main = documentRef.querySelector<HTMLElement>("main") || documentRef.body;
  if (!main) return [];

  const text = compactMessageText(main.innerText || "");
  if (text.length < 20) return [];

  return [
    {
      id: `${provider}-fallback-0`,
      provider,
      role: "unknown",
      text: text.slice(0, 30000),
      markdown: text.slice(0, 30000),
      messageSelector: cssPath(main),
      order: 0
    }
  ];
}

function normalizeCandidates(
  provider: ChatProvider,
  candidates: Array<{ element: HTMLElement; role: ChatMessageRole; order: number }>,
  strictNoiseFiltering = false
): ChatMessageCandidate[] {
  return candidates
    .filter(({ element }) => isVisibleMessage(element))
    .map(({ element, role, order }) => {
      const readableElement = cloneReadableMessageElement(element);
      const text = cleanChatText(readableElement.innerText || readableElement.textContent || "", strictNoiseFiltering);
      const markdown = cleanChatText(htmlToMarkdown(readableElement), strictNoiseFiltering);
      return {
        id: `${provider}-${order}-${hashKey(text)}`,
        provider,
        role,
        text,
        html: element.innerHTML,
        markdown,
        messageSelector: cssPath(element),
        order
      };
    })
    .filter((message) => isUsefulChatText(message.text, strictNoiseFiltering))
    .filter(dedupeMessages);
}

function cloneReadableMessageElement(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll<HTMLElement>(
      [
        "button",
        "[role='button']",
        "input",
        "textarea",
        "select",
        "option",
        "nav",
        "menu",
        "svg",
        "canvas",
        "[hidden]",
        "[aria-hidden='true']",
        "[style*='display: none' i]",
        "[style*='visibility: hidden' i]"
      ].join(", ")
    )
    .forEach((node) => node.remove());

  clone.querySelectorAll<HTMLElement>("[aria-label], [title]").forEach((node) => {
    const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`;
    if (isControlTextLine(label)) node.remove();
  });

  removeControlLeafNodes(clone);
  return clone;
}

function findClosestMessageElement(provider: ChatProvider, target: Element, documentRef: Document): HTMLElement | null {
  const selectors =
    provider === "chatgpt"
      ? ["[data-message-author-role]"]
      : provider === "claude"
        ? ['[data-testid="user-message"]', '[data-testid="assistant-message"]', "[data-is-streaming]", ".font-claude-message", "[class*='font-claude-message']"]
        : provider === "gemini"
          ? [
              '[data-test-id="user-query"]',
              '[data-testid="user-query"]',
              ".user-query-container",
              ".query-text",
              "user-query",
              ".model-response-text",
              "model-response",
              "message-content",
              ".response-container"
            ]
          : [
              "[data-message-author-role]",
              "[data-role]",
              "[role='article']",
              "[data-testid*='message' i]",
              "[data-testid*='conversation' i]",
              "[class*='message' i]",
              "[class*='bubble' i]",
              "[class*='prose' i]",
              "[class*='markdown' i]",
              "[class*='segment' i]",
              "[class*='response' i]",
              "[class*='answer' i]",
              "[class*='query' i]",
              "p",
              "li",
              "pre"
            ];

  for (const selector of selectors) {
    const element = target.closest(selector);
    if (element instanceof HTMLElement && documentRef.documentElement.contains(element)) return element;
  }

  return null;
}

function inferProviderRole(provider: ChatProvider, element: HTMLElement): ChatMessageRole {
  if (provider === "chatgpt") return normalizeRole(element.getAttribute("data-message-author-role"));
  if (provider === "gemini") return inferGeminiRole(element);
  return inferGenericRole(element);
}

function removeControlLeafNodes(root: HTMLElement): void {
  Array.from(root.querySelectorAll<HTMLElement>("span, div, a, p"))
    .filter((node) => node.children.length === 0)
    .forEach((node) => {
      if (isControlTextLine(node.textContent || "")) node.remove();
    });
}

function htmlToMarkdown(element: HTMLElement): string {
  try {
    return compactMessageText(turndown.turndown(element.innerHTML));
  } catch {
    return compactMessageText(element.innerText || element.textContent || "");
  }
}

function isVisibleMessage(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 120 &&
    rect.height > 20 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function normalizeRole(value: string | null): ChatMessageRole {
  if (value === "user" || value === "assistant" || value === "system") return value;
  return "unknown";
}

function inferGeminiRole(element: HTMLElement): ChatMessageRole {
  const descriptor = `${element.tagName} ${element.className} ${element.getAttribute("data-test-id") || ""} ${
    element.getAttribute("data-testid") || ""
  }`.toLowerCase();
  if (descriptor.includes("user") || descriptor.includes("query")) return "user";
  if (descriptor.includes("model") || descriptor.includes("response")) return "assistant";
  return "unknown";
}

function inferGenericRole(element: HTMLElement): ChatMessageRole {
  const authorRole = element.getAttribute("data-message-author-role");
  if (authorRole) return normalizeRole(authorRole);

  const descriptor = `${element.tagName} ${element.className} ${element.getAttribute("data-role") || ""} ${
    element.getAttribute("data-testid") || ""
  } ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  if (descriptor.includes("user") || descriptor.includes("human") || descriptor.includes("question") || descriptor.includes("query")) return "user";
  if (
    descriptor.includes("assistant") ||
    descriptor.includes("model") ||
    descriptor.includes("ai") ||
    descriptor.includes("answer") ||
    descriptor.includes("response") ||
    descriptor.includes("bot")
  ) {
    return "assistant";
  }

  const rect = element.getBoundingClientRect();
  if (rect.right > window.innerWidth * 0.72) return "user";
  return "assistant";
}

function findLeafTextBlocks(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>("div, article, section, p, li, pre"));
  return all.filter((element) => {
    const text = compactMessageText(element.innerText || element.textContent || "");
    if (text.length < 12 || text.length > 12000) return false;
    if (!isVisibleMessage(element)) return false;

    const meaningfulChildren = Array.from(element.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;
      const childText = compactMessageText(child.innerText || child.textContent || "");
      return childText.length >= 12 && child.getBoundingClientRect().height > 20;
    });

    return meaningfulChildren.length <= 1;
  });
}

function uniqueByElement<T extends { element: HTMLElement }>(items: T[]): T[] {
  const result: T[] = [];
  for (const item of items) {
    if (result.some((existing) => existing.element === item.element)) continue;
    if (result.some((existing) => existing.element.contains(item.element))) continue;
    result.push(item);
  }
  return result;
}

function dedupeMessages(message: ChatMessageCandidate, index: number, messages: ChatMessageCandidate[]): boolean {
  const key = `${message.role}:${message.text}`;
  return messages.findIndex((candidate) => `${candidate.role}:${candidate.text}` === key) === index;
}

function documentOrder(a: HTMLElement, b: HTMLElement): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function hashKey(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
