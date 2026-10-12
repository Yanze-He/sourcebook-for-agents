import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPointWithinRect } from "../src/canvas/tldraw.ts";

describe("tldraw canvas hit testing", () => {
  const rect = { top: 100, right: 460, bottom: 360, left: 140, width: 320, height: 260 };

  it("recognizes a pointer inside a visible image shape", () => {
    assert.equal(isPointWithinRect({ x: 300, y: 220 }, rect), true);
  });

  it("rejects pointers outside a shape or shapes too small to Pick", () => {
    assert.equal(isPointWithinRect({ x: 120, y: 220 }, rect), false);
    assert.equal(isPointWithinRect({ x: 300, y: 220 }, { ...rect, width: 100 }), false);
  });
});
