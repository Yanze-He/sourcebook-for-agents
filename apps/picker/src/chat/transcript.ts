import type { ChatMessageCandidate, ChatMessageRole, ChatProvider, ConversationPick } from "../shared/types";

export function buildConversationPick(provider: ChatProvider, messages: ChatMessageCandidate[]): ConversationPick {
  const roleCounts: Record<ChatMessageRole, number> = {
    user: 0,
    assistant: 0,
    system: 0,
    unknown: 0
  };

  for (const message of messages) roleCounts[message.role] += 1;

  return {
    provider,
    messages,
    messageCount: messages.length,
    roleCounts
  };
}

export function transcriptFromMessages(provider: ChatProvider, messages: ChatMessageCandidate[]): string {
  const body = messages
    .map((message, index) => {
      const role = message.role === "unknown" ? "message" : message.role;
      const content = (message.markdown || message.text).trim();
      return `## ${index + 1}. ${role}\n\n${content}`;
    })
    .join("\n\n---\n\n");

  return body.trim();
}
