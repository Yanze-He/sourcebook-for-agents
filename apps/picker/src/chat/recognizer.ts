import type { ChatProvider } from "../shared/types";

export function detectChatProvider(url: string): ChatProvider | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "chatgpt.com" || hostname === "chat.openai.com") return "chatgpt";
    if (hostname === "gemini.google.com") return "gemini";
    if (hostname === "chat.deepseek.com" || hostname === "deepseek.com" || hostname === "www.deepseek.com") return "deepseek";
    if (hostname === "grok.com" || hostname.endsWith(".grok.com") || hostname === "grok.x.ai") return "grok";
    return undefined;
  } catch {
    return undefined;
  }
}

export function providerLabel(provider: ChatProvider): string {
  const labels: Partial<Record<ChatProvider, string>> = {
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    deepseek: "DeepSeek",
    grok: "Grok"
  };
  return labels[provider] || provider;
}
