import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectChatProvider } from "../src/chat/recognizer.ts";
import { cleanChatText, isControlTextLine, isUsefulChatText } from "../src/chat/text-cleaning.ts";
import { transcriptFromMessages } from "../src/chat/transcript.ts";

describe("chat recognizer", () => {
  it("recognizes supported chat providers", () => {
    assert.equal(detectChatProvider("https://chatgpt.com/c/abc"), "chatgpt");
    assert.equal(detectChatProvider("https://chat.openai.com/c/abc"), "chatgpt");
    assert.equal(detectChatProvider("https://gemini.google.com/app/abc"), "gemini");
    assert.equal(detectChatProvider("https://chat.deepseek.com/a/chat/s/abc"), "deepseek");
    assert.equal(detectChatProvider("https://grok.com/chat/abc"), "grok");
    assert.equal(detectChatProvider("https://claude.ai/chat/abc"), undefined);
    assert.equal(detectChatProvider("https://www.kimi.com/chat/abc"), undefined);
    assert.equal(detectChatProvider("https://example.com"), undefined);
  });
});

describe("chat text cleaning", () => {
  it("removes button labels and coordinate/style noise from Picked messages", () => {
    const cleaned = cleanChatText(
      [
        "这是 Kimi 返回的正文内容。",
        "复制",
        "重新生成",
        "Share",
        "top: 42px",
        "width: 320px",
        "继续保留这一句。"
      ].join("\n"),
      true
    );

    assert.equal(cleaned, "这是 Kimi 返回的正文内容。\n继续保留这一句。");
  });

  it("rejects control-only chat fragments", () => {
    assert.equal(isControlTextLine("复制"), true);
    assert.equal(isControlTextLine("Copy Share"), true);
    assert.equal(isUsefulChatText("复制\n重新生成", true), false);
    assert.equal(isUsefulChatText("请帮我复制这段文案", true), true);
  });

  it("keeps short, meaningful messages when strict filtering is disabled", () => {
    assert.equal(isUsefulChatText("你", false), true);
    assert.equal(isUsefulChatText("你是谁", false), true);
    assert.equal(isUsefulChatText("你是谁", true), false);
  });
});

describe("chat transcript", () => {
  it("starts with the first picked message instead of a generated conversation title", () => {
    const transcript = transcriptFromMessages("grok", [
      { id: "1", provider: "grok", role: "user", text: "你是谁", order: 0 }
    ]);

    assert.equal(transcript, "## 1. user\n\n你是谁");
  });
});
