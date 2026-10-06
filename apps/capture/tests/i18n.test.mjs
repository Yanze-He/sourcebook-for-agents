import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserLanguage, languageFromTag } from "../src/shared/i18n.ts";

describe("browser language", () => {
  it("uses Chinese for zh browser language tags", () => {
    assert.equal(languageFromTag("zh-CN"), "zh");
    assert.equal(languageFromTag("zh-Hant"), "zh");
  });

  it("uses English for non-Chinese browser language tags", () => {
    assert.equal(languageFromTag("en-US"), "en");
    assert.equal(languageFromTag("fr-FR"), "en");
  });

  it("falls back when browser UI language is unavailable", () => {
    assert.equal(
      browserLanguage(() => {
        throw new Error("not implemented");
      }),
      languageFromTag(globalThis.navigator?.language)
    );
  });
});
