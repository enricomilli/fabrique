import assert from "node:assert/strict";
import { test } from "node:test";
import { type FicheStructure, parseFicheStructure } from "../src/lib/docs.schema.ts";

const structure: FicheStructure = {
	thesis_id: "example",
	parquet_blocks: 10,
	parquet_pages: 2,
	metadata: {
		titre: "Example title",
		auteur: "Example author",
		annee: "2015",
		etablissement: null,
		discipline: null,
		mots_cles: ["research"],
		pages: 2,
	},
	toc: [{
		title: "Introduction", page_start: null, page_end: null,
		level: 0, role: "frontmatter", page_start_parquet: null, page_end_parquet: null,
	}],
	page_offset: {
		intro_page_toc: null, intro_page_parquet: null, offset: null, method: "failed",
	},
	toc_validation: { issues: ["Missing page number."], ok: false },
};

test("parses structured metadata and permits null values from the producer", () => {
	assert.deepEqual(parseFicheStructure(JSON.stringify(structure)), structure);
});

test("rejects malformed JSON and invalid metadata types", () => {
	assert.throws(() => parseFicheStructure("{invalid"), SyntaxError);
	assert.throws(() => parseFicheStructure(JSON.stringify({
		...structure,
		metadata: { ...structure.metadata, pages: "2" },
	})));
	assert.throws(() => parseFicheStructure("{}"));
});
