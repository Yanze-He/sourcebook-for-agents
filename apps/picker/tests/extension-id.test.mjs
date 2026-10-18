import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const alphabet = "abcdefghijklmnop";

describe("bundled Picker identity", () => {
  it("keeps the manifest public key and local API allowlist in sync", async () => {
    const config = await readFile(new URL("../wxt.config.ts", import.meta.url), "utf8");
    const service = await readFile(new URL("../../service-go/api.go", import.meta.url), "utf8");
    const key = config.match(/key:\s*"([^"]+)"/)?.[1];
    assert.ok(key, "the manifest must include a stable public key");
    const extensionID = [...createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16)]
      .map((byte) => alphabet[byte >> 4] + alphabet[byte & 15])
      .join("");
    assert.match(service, new RegExp(`LocalPickerExtensionID\\s+= "${extensionID}"`));
    assert.match(service, /ChromeWebStorePickerExtensionID\s+= "pkglhngkfkjblabnhgcioindjgffgfpf"/);
  });
});
