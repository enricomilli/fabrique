import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentContent } from "../src/components/document-content";
import { extractFicheHeadings, remarkFicheAnchors, rehypeFicheSections } from "../src/lib/fiche-headings";
import { remarkPageCitations } from "../src/lib/page-citations";

test("renders inline LaTeX and preserves PDF citations", () => {
	const markdown = String.raw`## Question 1

Nearly 40$\sigma$, amplitude $A_\phi$, and $\Lambda$CDM (p. 130).`;
	const html = renderToStaticMarkup(<DocumentContent markdown={markdown}
		remarkPlugins={[remarkFicheAnchors, [remarkPageCitations, { pdfUrl: "/api/pdfs/test" }]]}
		rehypePlugins={[rehypeFicheSections]} />);
	assert.equal((html.match(/class="katex"/g) ?? []).length, 3);
	assert.match(html, /<math/);
	assert.match(html, /σ/);
	assert.match(html, /Λ/);
	assert.match(html, /data-pdf-page="130"/);
	assert.match(html, /class="fiche-section"/);
});

test("renders display math and leaves code literal", () => {
	const html = renderToStaticMarkup(<DocumentContent markdown={"$$\nx^2 + y^2 = z^2\n$$\n\n`$x$`"} />);
	assert.match(html, /class="katex-display"/);
	assert.match(html, /<code>\$x\$<\/code>/);
});

test("keeps math heading IDs consistent with the sidebar", () => {
	const markdown = "## Results for $A_\\phi$";
	const html = renderToStaticMarkup(<DocumentContent markdown={markdown} remarkPlugins={[remarkFicheAnchors]} />);
	assert.ok(html.includes(`id="${extractFicheHeadings(markdown)[0].id}"`));
});

test("invalid math does not stop the document from rendering", () => {
	const html = renderToStaticMarkup(<DocumentContent markdown={String.raw`$\unknowncommand{x}$ continues.`} />);
	assert.match(html, /continues/);
});
