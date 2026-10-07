import TurndownService from "turndown";
import { cssPath } from "../shared/selector";
import type { ChatMessageCandidate, ChatMessageRole, ChatProvider } from "../shared/types";
import { detectChatProvider } from "./recognizer";
import { cleanChatText, compactMessageText, isControlTextLine, isUsefulChatText } from "./text-cleaning";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-"
});

const messageElementRefs = new WeakMap<ChatMessageCandidate, HTMLElement>();

export function chatMessageElement(message: ChatMessageCandidate): HTMLElement | undefined {
  const element = messageElementRefs.get(message);
  return element?.isConnected ? element : undefined;
}

export function extractVisibleChat(documentRef: Document = document): {
  provider: ChatProvider;
  messages: ChatMessageCandidate[];
} | undefined {
  const provider = detectChatProvider(documentRef.location.href);
  if (!provider) return undefined;

  return {
    provider,
    // A page-level fallback includes navigation, prompts, and thought traces. Only
    // preserve messages whose provider-specific container gives us a known role.
    messages: extractProviderMessages(provider, documentRef).filter((message) => message.role !== "unknown")
  };
}

export function extractProviderMessages(provider: ChatProvider, documentRef: Document = document): ChatMessageCandidate[] {
  if (provider === "chatgpt") return extractChatGptMessages(documentRef);
  if (provider === "claude") return extractClaudeMessages(documentRef);
  if (provider === "gemini") return extractGeminiMessages(documentRef);
  if (provider === "deepseek") return extractDeepSeekMessages(documentRef);
  if (provider === "kimi") return extractKimiMessages(documentRef);
  if (provider === "grok") return extractGrokMessages(documentRef);
  return extractGenericChatMessages(provider, documentRef);
}

export function extractChatMessageFromElement(
  provider: ChatProvider,
  target: Element,
  documentRef: Document = document
): ChatMessageCandidate | undefined {
  const element = findClosestMessageElement(provider, target, documentRef);
  if (!element) return undefined;

  const candidate = normalizeCandidates(
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

  return candidate?.role === "unknown" ? undefined : candidate;
}

export function extractChatGptMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const elements = atomicMessageCandidates(
    uniqueByElement(
      chatGptMessageSelectors.flatMap((selector) =>
        Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
          element,
          role: inferChatGptRole(element)
        }))
      )
    ).filter((candidate) => candidate.role !== "unknown")
  );

  return normalizeCandidates(
    "chatgpt",
    elements
      .sort((a, b) => documentOrder(a.element, b.element))
      .map((candidate, order) => ({ ...candidate, order }))
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
  const elements = atomicMessageCandidates(
    uniqueByElement(
      geminiMessageSelectors.flatMap((selector) =>
        Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
          element,
          role: inferGeminiRole(element)
        }))
      )
    ).filter((candidate) => candidate.role !== "unknown")
  );

  return normalizeCandidates(
    "gemini",
    elements.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order }))
  );
}

export function extractKimiMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const explicit = kimiMessageSelectors.flatMap((selector) =>
    Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
      element,
      role: inferKimiRole(element)
    }))
  );
  const fallback = kimiFallbackSelectors.flatMap((selector) =>
    Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
      element,
      role: inferKimiRole(element)
    }))
  );
  const elements = atomicMessageCandidates(
    uniqueByElement([...explicit, ...fallback]).filter((candidate) => candidate.role !== "unknown")
  );

  return normalizeCandidates(
    "kimi",
    elements.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order })),
    true
  );
}

export function extractDeepSeekMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const elements = atomicMessageCandidates(
    uniqueByElement(
      deepSeekMessageSelectors.flatMap((selector) =>
        Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => ({
          element,
          role: inferDeepSeekRole(element)
        }))
      )
    ).filter((candidate) => candidate.role !== "unknown")
  );

  return normalizeCandidates(
    "deepseek",
    elements.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order })),
    true
  );
}

export function extractGrokMessages(documentRef: Document = document): ChatMessageCandidate[] {
  const container = documentRef.querySelector<HTMLElement>("main") || documentRef.body;
  if (!container) return [];

  const explicit = atomicMessageCandidates(
    uniqueByElement(
      grokMessageSelectors.flatMap((selector) =>
        Array.from(container.querySelectorAll<HTMLElement>(selector)).map((element) => ({
          element,
          role: inferGrokRole(element)
        }))
      )
    ).filter((candidate) => candidate.role !== "unknown")
  );

  return normalizeCandidates(
    "grok",
    explicit.sort((a, b) => documentOrder(a.element, b.element)).map((candidate, order) => ({ ...candidate, order }))
  );
}

function atomicMessageCandidates<T extends { element: HTMLElement; role: ChatMessageRole }>(candidates: T[]): T[] {
  return candidates.filter(({ element }) =>
    !candidates.some(
      (other) =>
        other.element !== element &&
        element.contains(other.element) &&
        isMoreSpecificMessageNode(other.element, element)
    )
  );
}

function isMoreSpecificMessageNode(candidate: HTMLElement, ancestor: HTMLElement): boolean {
  const candidateText = compactMessageText(candidate.innerText || candidate.textContent || "");
  const ancestorText = compactMessageText(ancestor.innerText || ancestor.textContent || "");
  return candidateText.length >= 8 && candidateText.length < ancestorText.length;
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

function normalizeCandidates(
  provider: ChatProvider,
  candidates: Array<{ element: HTMLElement; role: ChatMessageRole; order: number }>,
  strictNoiseFiltering = false
): ChatMessageCandidate[] {
  return candidates
    .filter(({ element }) => isLoadedMessage(element) && isCurrentMessageVariant(element))
    .map(({ element, role, order }) => {
      const readableElement = cloneReadableMessageElement(provider, element);
      const text = cleanChatText(readableElement.innerText || readableElement.textContent || "", strictNoiseFiltering);
      const markdown = cleanChatText(htmlToMarkdown(readableElement), strictNoiseFiltering);
      const message: ChatMessageCandidate = {
        id: `${provider}-${order}-${hashKey(text)}`,
        provider,
        role,
        text,
        markdown,
        messageSelector: cssPath(element),
        order
      };
      messageElementRefs.set(message, element);
      return message;
    })
    .filter((message) => isUsefulChatText(message.text, strictNoiseFiltering))
    .filter(dedupeMessages);
}

function cloneReadableMessageElement(provider: ChatProvider, element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;

  if (provider === "kimi" || provider === "deepseek") {
    clone
      .querySelectorAll<HTMLElement>(
        [
          "[class*='thinking' i]",
          "[class*='thought' i]",
          "[class*='toolcall' i]",
          "[class*='tool-call' i]",
          "[data-testid*='thinking' i]",
          "[data-testid*='tool' i]"
        ].join(", ")
      )
      .forEach((node) => node.remove());
  }

  if (provider === "deepseek") {
    clone.querySelectorAll<HTMLElement>(".ds-think-content, [class*='think-content' i]").forEach((node) => node.remove());
  }

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
      ? chatGptMessageSelectors
      : provider === "claude"
        ? ['[data-testid="user-message"]', '[data-testid="assistant-message"]', "[data-is-streaming]", ".font-claude-message", "[class*='font-claude-message']"]
          : provider === "gemini"
          ? [
              ...geminiMessageSelectors
            ]
          : provider === "grok"
            ? grokMessageSelectors
            : provider === "kimi"
              ? [...kimiMessageSelectors, ...kimiFallbackSelectors]
              : provider === "deepseek"
                ? deepSeekMessageSelectors
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
              "[class*='query' i]"
            ];

  for (const selector of selectors) {
    const element = target.closest(selector);
    if (element instanceof HTMLElement && documentRef.documentElement.contains(element)) return element;
  }

  return null;
}

function inferProviderRole(provider: ChatProvider, element: HTMLElement): ChatMessageRole {
  if (provider === "chatgpt") return inferChatGptRole(element);
  if (provider === "gemini") return inferGeminiRole(element);
  if (provider === "kimi") return inferKimiRole(element);
  if (provider === "grok") return inferGrokRole(element);
  if (provider === "deepseek") return inferDeepSeekRole(element);
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

function isLoadedMessage(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 120 &&
    rect.height > 20 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function isCurrentMessageVariant(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const state = `${node.getAttribute("data-state") || ""} ${node.getAttribute("data-status") || ""}`.toLowerCase();
    if (
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      node.hasAttribute("inert") ||
      /(?:inactive|hidden|collapsed|exited|leaving)/.test(state)
    ) {
      return false;
    }
  }
  return true;
}

const chatGptMessageSelectors = [
  "[data-chatgpt-search-unit-key]",
  "[data-message-author-role]",
  "[data-turn='user']",
  "[data-turn='assistant']",
  "[data-role='user']",
  "[data-role='assistant']",
  "[data-testid='user-message']",
  "[data-testid='assistant-message']",
  "[data-testid*='conversation-turn' i]",
  "[data-testid*='user-turn' i]",
  "[data-testid*='assistant-turn' i]"
];

function inferChatGptRole(element: HTMLElement): ChatMessageRole {
  const searchUnitKey = element.getAttribute("data-chatgpt-search-unit-key") || element.getAttribute("data-content-search-unit-key") || "";
  if (/:user$/i.test(searchUnitKey)) return "user";
  if (/:assistant$/i.test(searchUnitKey)) return "assistant";

  const explicitRole = messageRoleAttribute(element);
  if (explicitRole) return normalizeRole(explicitRole);

  const descendantRole = element.querySelector<HTMLElement>("[data-message-author-role], [data-turn='user'], [data-turn='assistant'], [data-role='user'], [data-role='assistant']");
  const nestedRole = descendantRole ? messageRoleAttribute(descendantRole) : null;
  if (nestedRole) return normalizeRole(nestedRole);

  const descriptor = `${element.className} ${element.getAttribute("data-testid") || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  if (descriptor.includes("user")) return "user";
  if (descriptor.includes("assistant")) return "assistant";
  if (element.querySelector("button[aria-label*='Edit' i], button[aria-label*='编辑'], [data-testid*='edit' i]")) return "user";
  if (element.querySelector("button[aria-label*='Copy' i], button[aria-label*='复制'], [data-testid*='copy' i]")) return "assistant";
  return "unknown";
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

const geminiMessageSelectors = [
  "user-query-content",
  "model-response",
  '[data-test-id="user-query"]',
  '[data-testid="user-query"]'
];

const kimiMessageSelectors = [
  "#chat-container .chat-content-item-user",
  "#chat-container .chat-content-item-assistant",
  "#chat-container [data-message-author-role='user']",
  "#chat-container [data-message-author-role='assistant']",
  "#chat-container [data-message-role='user']",
  "#chat-container [data-message-role='assistant']",
  "#chat-container [data-role='user']",
  "#chat-container [data-role='assistant']",
  "#chat-container [data-testid='user-message']",
  "#chat-container [data-testid='assistant-message']",
  "#chat-container [data-testid*='user-message' i]",
  "#chat-container [data-testid*='assistant-message' i]",
  "#chat-container [class*='user-message' i]",
  "#chat-container [class*='assistant-message' i]"
];

const kimiFallbackSelectors = [
  "[data-message-id]",
  "[data-msg-id]",
  "[data-testid*='user-message' i]",
  "[data-testid*='assistant-message' i]",
  "[class*='chat-content-item' i]",
  "[class*='message-item' i]"
];

function inferKimiRole(element: HTMLElement): ChatMessageRole {
  if (element.classList.contains("chat-content-item-user")) return "user";
  if (element.classList.contains("chat-content-item-assistant")) return "assistant";
  const explicitRole = messageRoleAttribute(element);
  if (explicitRole) return normalizeRole(explicitRole);

  const descriptor = `${element.className} ${element.getAttribute("data-testid") || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  if (descriptor.includes("user") || descriptor.includes("human")) return "user";
  if (descriptor.includes("assistant") || descriptor.includes("bot") || descriptor.includes("answer")) return "assistant";
  if (element.querySelector("button[aria-label*='Edit' i], button[aria-label*='编辑']")) return "user";
  if (element.querySelector("button[aria-label*='Copy' i], button[aria-label*='复制'], [class*='markdown' i]")) return "assistant";
  return inferMessageRoleByPosition(element);
}

const deepSeekMessageSelectors = [
  ".ds-message",
  "[data-message-author-role]",
  "[data-message-role]",
  "[data-role='user']",
  "[data-role='assistant']",
  "[data-message-id]",
  "[data-testid='user-message']",
  "[data-testid='assistant-message']",
  "[data-testid*='user-message' i]",
  "[data-testid*='assistant-message' i]",
  "[data-testid*='assistant-message' i]"
];

function inferDeepSeekRole(element: HTMLElement): ChatMessageRole {
  const explicitRole = messageRoleAttribute(element);
  if (explicitRole) return normalizeRole(explicitRole);

  if (element.matches(".ds-message")) {
    return element.querySelector(".ds-assistant-message-main-content, .ds-think-content, [class*='assistant-message' i]")
      ? "assistant"
      : "user";
  }

  const descriptor = `${element.className} ${element.getAttribute("data-testid") || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  if (descriptor.includes("user") || descriptor.includes("human") || descriptor.includes("query")) return "user";
  if (element.matches(".ds-markdown") || descriptor.includes("assistant") || descriptor.includes("markdown") || descriptor.includes("response")) {
    return "assistant";
  }
  return inferMessageRoleByPosition(element);
}

const grokMessageSelectors = [
  "[data-testid='user-message']",
  "[data-testid='assistant-message']",
  "[data-testid*='user-message' i]",
  "[data-testid*='assistant-message' i]"
];

function inferGrokRole(element: HTMLElement): ChatMessageRole {
  const explicitRole = messageRoleAttribute(element);
  if (explicitRole) return normalizeRole(explicitRole);

  const descriptor = `${element.tagName} ${element.className} ${element.getAttribute("data-testid") || ""} ${
    element.getAttribute("aria-label") || ""
  }`.toLowerCase();
  if (descriptor.includes("user") || descriptor.includes("human") || descriptor.includes("query")) return "user";
  if (descriptor.includes("assistant") || descriptor.includes("grok") || descriptor.includes("response") || descriptor.includes("answer")) return "assistant";
  return inferGenericRole(element);
}

function messageRoleAttribute(element: HTMLElement): string | null {
  return (
    element.getAttribute("data-message-author-role") ||
    element.getAttribute("data-message-role") ||
    element.getAttribute("data-role") ||
    element.getAttribute("data-turn")
  );
}

function inferMessageRoleByPosition(element: HTMLElement): ChatMessageRole {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2 > window.innerWidth * 0.64 ? "user" : "assistant";
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
    if (!isLoadedMessage(element)) return false;

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
