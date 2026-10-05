import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentSummary } from "../src/lib/docs-fns.ts";
import { documentStatus, filterDocuments } from "../src/lib/document-list.ts";

const documents: DocumentSummary[] = [
	{
		id: "a", public: true, title: "Écologie marine", thesis: "these-a", generated: "2025-01-01",
		generationCompleted: false, hasFiche: true, hasNote: false, preview: "Marine research.",
		metadata: { titre: "Écologie marine", auteur: "Émilie Martin", annee: "2020", etablissement: "Université de Brest", discipline: "Écologie", mots_cles: ["plancton"], pages: 310 },
	},
	{
		id: "b", public: true, title: "La presse française", thesis: "these-b", generated: "2026-01-01",
		generationCompleted: false, hasFiche: true, hasNote: true, preview: "Press research.",
		metadata: { titre: "La presse française", auteur: null, annee: null, etablissement: null, discipline: "Histoire", mots_cles: [], pages: 200 },
	},
	{ id: "c", public: true, title: "Archive", thesis: "these-c", generated: "unknown", generationCompleted: false, hasFiche: false, hasNote: false, preview: "", metadata: null },
];

test("search ignores case and accents and matches every term", () => {
	assert.deepEqual(filterDocuments(documents, "  MARINE ecologie ", "all").map((item) => item.id), ["a"]);
	assert.equal(filterDocuments(documents, "marine presse", "all").length, 0);
	assert.equal(filterDocuments(documents, "these-b", "all")[0]?.id, "b");
});

test("status filters combine with search", () => {
	assert.equal(filterDocuments(documents, "", "both")[0]?.id, "b");
	assert.equal(filterDocuments(documents, "marine", "both").length, 0);
	assert.equal(filterDocuments(documents, "", "source")[0]?.id, "c");
	assert.equal(documentStatus({ ...documents[0], generationCompleted: false, hasFiche: false, hasNote: true }), "note");
});

test("recent sort puts unknown dates last and does not change the input", () => {
	assert.deepEqual(filterDocuments(documents, "", "all").map((item) => item.id), ["b", "a", "c"]);
	assert.deepEqual(documents.map((item) => item.id), ["a", "b", "c"]);
});

test("title sort and empty collections work", () => {
	assert.deepEqual(filterDocuments(documents, "", "all", "title", "fr").map((item) => item.id), ["c", "a", "b"]);
	assert.deepEqual(filterDocuments([], "", "all"), []);
});

test("search matches structured author, institution, year, discipline, and keywords", () => {
	for (const query of ["emilie martin", "Brest", "2020", "ecologie", "plancton"]) {
		assert.deepEqual(filterDocuments(documents, query, "all").map((item) => item.id), ["a"]);
	}
});

test("discipline combines with search and status filters", () => {
	assert.deepEqual(filterDocuments(documents, "", "all", "recent", "fr", "Écologie").map((item) => item.id), ["a"]);
	assert.equal(filterDocuments(documents, "", "both", "recent", "fr", "Écologie").length, 0);
	assert.equal(filterDocuments(documents, "marine", "all", "recent", "fr", "Histoire").length, 0);
	assert.equal(filterDocuments(documents, "", "all", "recent", "fr", "").length, 3);
});
