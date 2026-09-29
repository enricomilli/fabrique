import assert from "node:assert/strict";
import { test } from "node:test";
import type { Root } from "hast";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import {
	extractFicheHeadings,
	rehypeFicheSections,
	remarkFicheAnchors,
} from "../src/lib/fiche-headings.ts";

function render(markdown: string, sections = true): string {
	return renderToStaticMarkup(createElement(Markdown, {
		children: markdown,
		skipHtml: true,
		remarkPlugins: [remarkFicheAnchors],
		rehypePlugins: sections ? [rehypeFicheSections] : [],
	}));
}

test("groups root h2 sections and preserves the intro and nested hierarchy", () => {
	const markdown = [
		"# Title", "Intro.", "## First", "Body.", "### Detail",
		"> ## Quoted heading", "- ## List heading", "```md\n## Code heading\n```",
		"## Second", "Last paragraph.",
	].join("\n\n");
	const html = render(markdown);
	assert.ok(html.startsWith('<h1>Title</h1>\n<p>Intro.</p>\n<section class="fiche-section"><h2'));
	assert.equal((html.match(/<section /g) ?? []).length, 2);
	assert.match(html, /<h3>Detail<\/h3>[\s\S]*<blockquote>\n<h2>Quoted heading<\/h2>/);
	assert.match(html, /<li>\n<h2>List heading<\/h2>/);
	assert.match(html, /<pre><code class="language-md">## Code heading\n<\/code><\/pre>\n<\/section>/);
	assert.ok(html.endsWith('<p>Last paragraph.</p></section>'));
	assert.equal(html.replace(/<section class="fiche-section">|<\/section>/g, ""), render(markdown, false));
	for (const { id } of extractFicheHeadings(markdown)) {
		assert.ok(html.includes(`<h2 id="${id}" tabindex="-1">`));
	}
});

test("resolves inline and reference links across section boundaries", () => {
	const markdown = [
		"Intro [source][ref].",
		"## **First** [source][ref] and `code`",
		"[Inline](https://example.com/inline) and [source][ref].",
		"## Second", "[ref]: https://example.com/reference",
	].join("\n\n");
	const html = render(markdown);
	assert.equal((html.match(/href="https:\/\/example.com\/reference"/g) ?? []).length, 3);
	assert.ok(html.includes('<strong>First</strong> <a href="https://example.com/reference">source</a> and <code>code</code>'));
	assert.ok(html.includes('<a href="https://example.com/inline">Inline</a>'));
	assert.equal(html.replace(/<section class="fiche-section">|<\/section>/g, ""), render(markdown, false));
});

test("leaves documents without root h2 headings unchanged", () => {
	for (const markdown of ["", "Intro.", "# Title\n\n### Detail", "> ## Quote", "- ## List", "```md\n## Code\n``` "]) {
		assert.equal(render(markdown), render(markdown, false));
		assert.ok(!render(markdown).includes("<section"));
	}
});

test("keeps the original heading nodes and attributes inside consecutive sections", () => {
	const tree: Root = {
		type: "root",
		children: [
			{ type: "element", tagName: "h2", properties: { id: "first", tabIndex: -1 }, children: [] },
			{ type: "element", tagName: "h2", properties: { id: "second" }, children: [] },
		],
	};
	const original = [...tree.children];
	rehypeFicheSections()(tree);
	assert.equal(tree.children.length, 2);
	for (const [index, section] of tree.children.entries()) {
		assert.equal(section.type, "element");
		if (section.type !== "element") continue;
		assert.equal(section.tagName, "section");
		assert.equal(section.children[0], original[index]);
		assert.equal(section.properties.id, undefined);
	}
});
