import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkPageCitations, safePdfUrl, pdfPageUrl, validPdfPage } from "../src/lib/page-citations.ts";
import { rehypeFicheSections } from "../src/lib/fiche-headings.ts";

function render(markdown: string, pdfUrl: string | null = "/api/pdfs/example") {
	return renderToStaticMarkup(createElement(Markdown, {
		children: markdown, skipHtml: true,
		remarkPlugins: [[remarkPageCitations, { pdfUrl }]],
		rehypePlugins: [rehypeFicheSections],
	}));
}

test("SSR preserves citation text and links each list entry to its first page", () => {
	const text = "Source (p. 134), (p. 611-612), (p. 21, 613, 635), (p. 22–24, 40 - 42).";
	const html = render(text);
	assert.equal(html.replace(/<[^>]+>/g, ""), text);
	assert.deepEqual([...html.matchAll(/data-pdf-page="(\d+)"/g)].map((match) => Number(match[1])), [134, 611, 21, 613, 635, 22, 40]);
	assert.match(html, /href="\/api\/pdfs\/example#page=611" data-pdf-page="611">611-612<\/a>/);
});

test("only exact page citations match", () => {
	const text = "134 (134) p. 134 (pp. 12) (p. -1) (p. 0) (p. 12.5) (p. 9-2) (p. 9007199254740992) (p. 12; 14)";
	assert.doesNotMatch(render(text), /<a/);
});

test("leaves code, existing links, reference links, and raw HTML unchanged", () => {
	const text = [
		"`(p. 134)`", "```md\n(p. 134)\n```", "[(p. 134)](https://example.com)",
		"[(p. 134)][source]", '<span>(p. 134)</span>', '<div>\n(p. 134)\n</div>',
		"## References", "[source]: https://example.com/reference",
	].join("\n\n");
	const html = render(text);
	assert.doesNotMatch(html, /data-pdf-page/);
	assert.match(html, /href="https:\/\/example.com\/reference"/);
	assert.match(html, /<code>\(p\. 134\)<\/code>/);
});

test("supports nested text nodes and definitions across section boundaries", () => {
	const html = render("## One\n\n**(p. 4)** and [ref][source].\n\n> (p. 5)\n\n- (p. 6)\n\n## Two\n\n[source]: https://example.com");
	assert.equal((html.match(/data-pdf-page/g) ?? []).length, 3);
	assert.match(html, /href="https:\/\/example.com"/);
});

test("requires a safe PDF URL and preserves query parameters", () => {
	for (const value of [null, "", "javascript:alert(1)", "data:application/pdf,test", "//evil.test/a", "/other", "https://example.com/\nfile"]) {
		assert.equal(safePdfUrl(value), null);
		assert.doesNotMatch(render("(p. 134)", value), /<a/);
	}
	assert.equal(pdfPageUrl("https://example.com/a.pdf?token=abc#old", 4), "https://example.com/a.pdf?token=abc#page=4");
	assert.match(render("(p. 4)", "https://example.com/a.pdf?token=abc#old"), /token=abc#page=4/);
});

test("physical page bounds reject unavailable and unsafe pages", () => {
	for (const page of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 11]) assert.equal(validPdfPage(page, 10), false);
	assert.equal(validPdfPage(1, 10), true);
	assert.equal(validPdfPage(10, 10), true);
});

test("raw HTML blocks do not suppress citations elsewhere in the document", () => {
	const html = render("<div>\n(p. 8)\n</div>\n\nSource (p. 9).");
	assert.doesNotMatch(html, /data-pdf-page="8"/);
	assert.match(html, /data-pdf-page="9"/);
});
