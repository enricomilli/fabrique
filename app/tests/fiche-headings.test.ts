import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import {
	currentFicheHeading,
	extractFicheHeadings,
	remarkFicheAnchors,
} from "../src/lib/fiche-headings.ts";

function render(markdown: string, anchors = true): string {
	return renderToStaticMarkup(createElement(Markdown, {
		children: markdown,
		skipHtml: true,
		remarkPlugins: anchors ? [remarkFicheAnchors] : [],
	}));
}

test("extracts only root h2 headings from the Markdown AST", () => {
	const markdown = [
		"# Title", "", "## **Méthodes** et `résultats`", "",
		"Setext section", "--------------", "",
		"### Detail", "", "> ## Quoted heading", "",
		"- ## List heading", "", "```md", "## Code heading", "```", "",
		"    ## Indented code", "", "<h2>HTML heading</h2>",
	].join("\n");
	assert.deepEqual(extractFicheHeadings(markdown), [
		{ id: "fiche-methodes-et-resultats", label: "Méthodes et résultats" },
		{ id: "fiche-setext-section", label: "Setext section" },
	]);
	const html = render(markdown);
	for (const heading of extractFicheHeadings(markdown)) {
		assert.ok(html.includes(`<h2 id="${heading.id}" tabindex="-1">`));
	}
	assert.equal((html.match(/id="fiche-/g) ?? []).length, 2);
});

test("duplicate and empty slugs get deterministic unique rendered IDs", () => {
	const markdown = "## Étude\n\n## Etude\n\n## Etude 2\n\n## Etude\n\n## !!!\n\n## ???\n\n##";
	const headings = extractFicheHeadings(markdown);
	assert.deepEqual(headings.map(({ id }) => id), [
		"fiche-etude", "fiche-etude-2", "fiche-etude-2-2", "fiche-etude-3",
		"fiche-section", "fiche-section-2", "fiche-section-3",
	]);
	assert.deepEqual(extractFicheHeadings(markdown), headings);
	const renderedIds = [...render(markdown).matchAll(/<h2 id="([^"]+)" tabindex="-1">/g)]
		.map((match) => match[1]);
	assert.deepEqual(renderedIds, headings.map(({ id }) => id));
});

test("keeps inline links, reference definitions, and formatted heading content", () => {
	const markdown = "## **Lire** [la source][source] et [le lien](https://example.com/inline)\n\nVoir [la source][source].\n\n[source]: https://example.com/reference";
	assert.deepEqual(extractFicheHeadings(markdown), [{
		id: "fiche-lire-la-source-et-le-lien",
		label: "Lire la source et le lien",
	}]);
	const html = render(markdown);
	assert.ok(html.includes('<strong>Lire</strong> <a href="https://example.com/reference">la source</a>'));
	assert.ok(html.includes('<a href="https://example.com/inline">le lien</a>'));
	assert.ok(html.includes('<p>Voir <a href="https://example.com/reference">la source</a>.</p>'));
	assert.equal(html.replace(/ id="[^"]+" tabindex="-1"/g, ""), render(markdown, false));
});

test("handles documents without headings and leaves note headings unchanged", () => {
	for (const markdown of ["", "A paragraph.", "```\n## Code\n```", "# Title\n\n### Detail"]) {
		assert.deepEqual(extractFicheHeadings(markdown), []);
		assert.equal(render(markdown), render(markdown, false));
	}
	assert.equal(render("## Note", false), "<h2>Note</h2>");
});

test("scrollspy follows section boundaries in both directions and selects the last section at the bottom", () => {
	const positions = (scroll: number) => [
		{ id: "first", top: 200 - scroll },
		{ id: "second", top: 700 - scroll },
		{ id: "last", top: 1200 - scroll },
	];
	assert.equal(currentFicheHeading(positions(0), 96, false), "first");
	assert.equal(currentFicheHeading(positions(604), 96, false), "second");
	assert.equal(currentFicheHeading(positions(1104), 96, false), "last");
	assert.equal(currentFicheHeading(positions(700), 96, false), "second");
	assert.equal(currentFicheHeading(positions(603), 96, false), "first");
	assert.equal(currentFicheHeading(positions(1000), 96, true), "last");
	assert.equal(currentFicheHeading([], 96, false), null);
	assert.equal(currentFicheHeading([], 96, true), null);
});
