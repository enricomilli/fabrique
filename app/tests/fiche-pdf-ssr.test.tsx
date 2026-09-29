import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";
import { FicheContent } from "../src/components/fiche-content";
import { PdfSidebar } from "../src/components/pdf-sidebar";

test("fiche SSR makes citations usable without importing the browser PDF renderer", () => {
	assert.equal(typeof window, "undefined");
	assert.equal(typeof globalThis.DOMMatrix, "undefined");
	const html = renderToString(<FicheContent markdown={"# Title\n\n## Section\n\nSource (p. 3)."} pdfUrl="/api/pdfs/test" />);
	assert.match(html, /data-pdf-page="3"/);
	assert.match(html, /href="\/api\/pdfs\/test#page=3"/);
	assert.doesNotMatch(html, /<canvas|<dialog|<iframe/);
	assert.doesNotMatch(renderToString(<FicheContent markdown="(p. 3)" />), /<a\s/);
});

test("an open sidebar also defers PDF.js and browser APIs during SSR", () => {
	assert.equal(renderToString(<PdfSidebar url="/api/pdfs/test" page={3} onPageChange={() => {}} onClose={() => {}} />), "");
});
