import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PICKER_OVERLAY_POSITION, storedPickerOverlayPosition } from "../src/shared/overlay-position.ts";

describe("Picker overlay position preference", () => {
  it("defaults safely and accepts each supported corner", () => {
    assert.equal(DEFAULT_PICKER_OVERLAY_POSITION, "top-right");
    assert.equal(storedPickerOverlayPosition(undefined), "top-right");
    assert.equal(storedPickerOverlayPosition("bottom-right"), "bottom-right");
    assert.equal(storedPickerOverlayPosition("bottom-left"), "bottom-left");
    assert.equal(storedPickerOverlayPosition("top-left"), "top-left");
  });

  it("rejects unsupported stored values", () => {
    assert.equal(storedPickerOverlayPosition("middle"), "top-right");
  });
});
