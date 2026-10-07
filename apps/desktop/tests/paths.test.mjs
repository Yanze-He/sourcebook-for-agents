import assert from "node:assert/strict";
import test from "node:test";
import { sourcebookDataDirectory, sourcebookLibraryDirectory, sourcebookUrl } from "../src/paths.mjs";

test("uses platform-native Sourcebook data directories", () => {
  assert.equal(sourcebookDataDirectory({}, "darwin", "/Users/test"), "/Users/test/Library/Application Support/Sourcebook for Agents");
  assert.equal(sourcebookDataDirectory({ APPDATA: "C:\\Users\\test\\AppData\\Roaming" }, "win32", "C:\\Users\\test"), "C:\\Users\\test\\AppData\\Roaming/Sourcebook for Agents");
});

test("uses the loopback Sources URL", () => {
  assert.equal(sourcebookUrl(4177), "http://127.0.0.1:4177/");
});

test("honors an explicitly selected library directory", () => {
  assert.equal(sourcebookLibraryDirectory({ SOURCEBOOK_LIBRARY_DIR: "/Volumes/Archive/Sourcebook Library" }, "darwin", "/Users/test"), "/Volumes/Archive/Sourcebook Library");
});
