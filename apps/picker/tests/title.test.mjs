import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncatePickTitle } from "../src/shared/title.ts";

describe("Pick title truncation", () => {
  it("keeps up to 30 Latin characters", () => {
    assert.equal(truncatePickTitle("a".repeat(30)), "a".repeat(30));
    assert.equal(truncatePickTitle("a".repeat(31)), `${"a".repeat(30)}…`);
  });

  it("keeps up to 15 Chinese characters", () => {
    assert.equal(truncatePickTitle("中".repeat(15)), "中".repeat(15));
    assert.equal(truncatePickTitle("中".repeat(16)), `${"中".repeat(15)}…`);
  });

  it("uses the same budget for mixed titles", () => {
    assert.equal(truncatePickTitle(`${"中".repeat(14)}ab`), `${"中".repeat(14)}ab`);
    assert.equal(truncatePickTitle(`${"中".repeat(14)}abc`), `${"中".repeat(14)}ab…`);
  });
});
