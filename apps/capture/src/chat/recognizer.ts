import type { ChatProvider } from "../shared/types";

export function detectChatProvider(url: string): ChatProvider | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "chatgpt.com" || hostname === "chat.openai.com") return "chatgpt";
    if (hostname === "claude.ai") return "claude";
    if (hostname === "gemini.google.com") return "gemini";
    if (hostname === "chat.deepseek.com" || hostname === "deepseek.com" || hostname === "www.deepseek.com") return "deepseek";
    if (hostname === "doubao.com" || hostname.endsWith(".doubao.com")) return "doubao";
    if (hostname === "chat.qwen.ai" || hostname === "qwen.ai" || hostname.endsWith(".qwen.ai")) return "qianwen";
    if (hostname === "kimi.com" || hostname.endsWith(".kimi.com")) return "kimi";
    if (hostname === "grok.com" || hostname.endsWith(".grok.com") || hostname === "grok.x.ai") return "grok";
    if (hostname === "perplexity.ai" || hostname.endsWith(".perplexity.ai")) return "perplexity";
    return undefined;
  } catch {
    return undefined;
  }
}

export function providerLabel(provider: ChatProvider): string {
  const labels: Record<ChatProvider, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    deepseek: "DeepSeek",
    doubao: "豆包",
    qianwen: "千问",
    kimi: "Kimi",
    grok: "Grok",
    perplexity: "Perplexity"
  };
  return labels[provider];
}
