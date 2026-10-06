import assert from "node:assert/strict";
import test from "node:test";
import { sourcebookDataDirectory, sourcebookUrl } from "../src/paths.mjs";

test("uses platform-native Sourcebook data directories", () => {
  assert.equal(sourcebookDataDirectory({}, "darwin", "/Users/test"), "/Users/test/Library/Application Support/Sourcebook for Agents");
  assert.equal(sourcebookDataDirectory({ APPDATA: "C:\\Users\\test\\AppData\\Roaming" }, "win32", "C:\\Users\\test"), "C:\\Users\\test\\AppData\\Roaming/Sourcebook for Agents");
});

test("uses the loopback workspace URL", () => {
  assert.equal(sourcebookUrl(4177), "http://127.0.0.1:4177/");
});
