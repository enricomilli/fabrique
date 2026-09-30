import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NoteContent } from "../src/components/note-content";

const markdown = `# Markdown title

## Results

Source (p. 3), (p. 11-12), (p. 21, 25–27).

## Pour citer

Author. *Original title*. University, 2024. https://example.com/thesis`;

function render(pdfUrl?: string | null, text = markdown) {
	return renderToStaticMarkup(<NoteContent title="Document title" markdown={text} pdfUrl={pdfUrl} />);
}

test("note SSR links citations without browser PDF dependencies", () => {
	assert.equal(typeof window, "undefined");
	assert.equal(typeof globalThis.DOMMatrix, "undefined");
	const html = render("/api/pdfs/test");
	assert.deepEqual([...html.matchAll(/data-pdf-page="(\d+)"/g)].map((match) => Number(match[1])), [3, 11, 21, 25]);
	assert.match(html, /href="\/api\/pdfs\/test#page=11"/);
	assert.match(html, />11-12<\/a>/);
	assert.match(html, />25–27<\/a>/);
	assert.match(html, /aria-label=/);
	assert.doesNotMatch(html, /<canvas|<dialog|<iframe/);
});

test("note SSR preserves citations as text without a safe PDF", () => {
	for (const url of [undefined, null, "", "javascript:alert(1)"]) {
		const html = render(url);
		assert.doesNotMatch(html, /data-pdf-page|<a\s/);
		assert.match(html, /Source \(p\. 3\), \(p\. 11-12\), \(p\. 21, 25–27\)\./);
	}
});

test("note keeps its title, authoritative markdown, and normal bibliographic footer", () => {
	const html = render("/api/pdfs/test");
	assert.match(html, />Document title<\/h1>/);
	assert.match(html, /<h1>Markdown title<\/h1>/);
	assert.match(html, /<h2>Pour citer<\/h2>\s*<p>Author\. <em>Original title<\/em>\. University, 2024\. https:\/\/example.com\/thesis<\/p>/);
	assert.doesNotMatch(html, /fiche-section|fiche-reading|fiche-content|<nav|<section|snap-start/);
});

test("note renders math with citations and keeps code and ordinary links unchanged", () => {
	const text = [
		String.raw`Inline $A_\phi$ (p. 7).`,
		"$$\nx^2 + y^2 = z^2\n$$",
		"`(p. 8)`",
		"[(p. 9)](https://example.com)",
	].join("\n\n");
	const html = render("/api/pdfs/test", text);
	assert.match(html, /class="katex"/);
	assert.match(html, /class="katex-display"/);
	assert.match(html, /data-pdf-page="7"/);
	assert.doesNotMatch(html, /data-pdf-page="[89]"/);
	assert.match(html, /<code>\(p\. 8\)<\/code>/);
	assert.match(html, /href="https:\/\/example.com"/);
});
