import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

test("GFM tables render with headings, cells, and alignment", () => {
  const markdown = "| Source | Status |\n| :--- | ---: |\n| Cat image | Pending |";
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown));

  assert.match(html, /<table>/);
  assert.match(html, /<th style="text-align:left">Source<\/th>/);
  assert.match(html, /<th style="text-align:right">Status<\/th>/);
  assert.match(html, /<td style="text-align:left">Cat image<\/td>/);
  assert.match(html, /<td style="text-align:right">Pending<\/td>/);
});
