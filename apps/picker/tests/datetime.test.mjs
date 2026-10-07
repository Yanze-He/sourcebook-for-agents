import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLocalDateTime } from "../src/shared/datetime.ts";

describe("local date time formatting", () => {
  it("uses a consistent YYYY-MM-DD HH:mm format", () => {
    assert.equal(formatLocalDateTime(new Date(2026, 9, 7, 17, 44)), "2026-10-07 17:44");
  });

  it("returns an empty value for an invalid timestamp", () => {
    assert.equal(formatLocalDateTime("not-a-date"), "");
  });
});
