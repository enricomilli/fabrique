import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { getExplorerDirectory, loadDocument, loadDocuments } from "../src/lib/docs.server.ts";
import { docsSchema, type Docs, type FicheStructure } from "../src/lib/docs.schema.ts";

function document(): Docs {
	return {
		generated: "2026-01-01",
		fiche: {
			dir: "", fiche_md: "# Example title", has_full_calls: false,
			intro_md: "", steps: [], structure_json: "", thesis: "example-thesis",
		},
		note: {
			config: {
				blob_chars: 0, blob_tok_est: 0, fiche_path: "", model: "",
				parquet_path: "", prompt_chars: 0, rlm_config: "", run_id: "",
				shim_env: { GEMMA_SERVER_URL: "" }, thesis: "example-thesis",
			},
			dir: "", iterations: [],
			metadata: {
				iterations: 0, note_word_count: 0, rlm_status: "", rlm_time_s: 0,
				run_dir: "", sub_queries: 0, trace_files: 0, trace_root_calls: 0,
				trace_subquery_calls: 0, wall_time_s: 0,
			},
			note_md: "A note", prompt: "", rlm_stdout: "", run_id: "", thesis: "example-thesis",
		},
	};
}

async function writeDocument(root: string, id: string, input: unknown): Promise<void> {
	await mkdir(join(root, id));
	await writeFile(join(root, id, "data.json"), JSON.stringify(input));
}

test("loader returns sorted summaries without document bodies", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeDocument(root, "b", document());
	const fallback = document();
	fallback.fiche.fiche_md = " \n";
	fallback.note.note_md = "";
	await writeDocument(root, "a", fallback);
	await mkdir(join(root, "unrelated"));
	assert.deepEqual(await loadDocuments(root), [
		{ id: "a", title: "example-thesis", metadata: null, thesis: "example-thesis", generated: "2026-01-01", hasFiche: false, hasNote: false, preview: "" },
		{ id: "b", title: "Example title", metadata: null, thesis: "example-thesis", generated: "2026-01-01", hasFiche: true, hasNote: true, preview: "" },
	]);
});

test("title uses the first heading outside a code fence", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.fiche_md = "```md\n# Code\n```\n## Real title ##\n# Later";
	await writeDocument(root, "a", input);
	assert.equal((await loadDocuments(root))[0]?.title, "Real title");
});

test("loader distinguishes an empty directory from a missing directory", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	assert.deepEqual(await loadDocuments(root), []);
	await assert.rejects(loadDocuments(join(root, "missing")), /Cannot read the document directory/);
});

test("invalid JSON fails without exposing its contents", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "a"));
	await writeFile(join(root, "a", "data.json"), "private-invalid-content");
	await assert.rejects(loadDocuments(root), (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.match(error.message, /Invalid JSON/);
		assert.doesNotMatch(error.message, /private-invalid-content/);
		return true;
	});
});

test("missing array fields fail validation without partial results", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeDocument(root, "a", document());
	const input = document();
	await writeDocument(root, "b", { ...input, note: { ...input.note, iterations: [{}] } });
	await assert.rejects(loadDocuments(root), /Invalid document schema:.*note.iterations.0.budget/);
});

test("directory configuration requires an absolute override", () => {
	const original = process.env.EXPLORER_DIR;
	try {
		process.env.EXPLORER_DIR = "relative";
		assert.throws(getExplorerDirectory, /absolute directory path/);
		process.env.EXPLORER_DIR = tmpdir();
		assert.equal(getExplorerDirectory(), tmpdir());
	} finally {
		if (original === undefined) delete process.env.EXPLORER_DIR;
		else process.env.EXPLORER_DIR = original;
	}
});

test("preview uses fiche text without common Markdown markers", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.fiche_md = "# Example title\n\nA **research** summary with [sources](https://example.com).\n\n- First finding\n\n```text\nNot preview text\n```";
	await writeDocument(root, "a", input);
	assert.equal((await loadDocuments(root))[0]?.preview, "A research summary with sources. First finding");
});

test("preview uses the note when the fiche is empty and limits its length", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.fiche_md = " ";
	input.note.note_md = `# Note title\n\n${"Note content. ".repeat(100)}`;
	await writeDocument(root, "a", input);
	const summary = (await loadDocuments(root))[0];
	assert.equal(summary.title, "Note title");
	assert.ok(summary.preview.startsWith("Note content."));
	assert.ok(summary.preview.length <= 600);
	assert.ok(summary.preview.endsWith("…"));
	assert.equal(summary.hasFiche, false);
});

function structure(): FicheStructure {
	return {
		thesis_id: "example-thesis",
		parquet_blocks: 12,
		parquet_pages: 42,
		metadata: {
			titre: "**Structured** _title_ with [sources](https://example.com)",
			auteur: "Example Author",
			annee: "2026",
			etablissement: "Example University",
			discipline: "History",
			mots_cles: ["research"],
			pages: 42,
		},
		toc: [],
		page_offset: { intro_page_toc: null, intro_page_parquet: null, offset: null, method: "failed" },
		toc_validation: { issues: [], ok: true },
	};
}

test("structured metadata supplies the title and preserves every metadata field", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	const parsed = structure();
	input.fiche.structure_json = JSON.stringify(parsed);
	await writeDocument(root, "a", input);
	const summary = (await loadDocuments(root))[0];
	assert.equal(summary.title, "Structured title with sources");
	assert.deepEqual(summary.metadata, parsed.metadata);
});

test("null or empty metadata titles use the heading without inventing metadata", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [index, titre] of [null, "  ", "<span></span>"].entries()) {
		const input = document();
		const parsed = structure();
		parsed.metadata = { titre, auteur: null, annee: null, etablissement: null, discipline: null, mots_cles: [], pages: 0 };
		input.fiche.structure_json = JSON.stringify(parsed);
		await writeDocument(root, String(index), input);
	}
	const summaries = await loadDocuments(root);
	for (const summary of summaries) {
		assert.equal(summary.title, "Example title");
		assert.equal(summary.metadata?.auteur, null);
		assert.equal(summary.metadata?.etablissement, null);
		assert.equal(summary.metadata?.annee, null);
		assert.equal(summary.metadata?.discipline, null);
		assert.equal(summary.metadata?.pages, 0);
	}
	assert.equal(summaries[0].metadata?.titre, null);
});

test("whitespace structure uses the existing heading fallback", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.structure_json = " \n\t";
	await writeDocument(root, "a", input);
	const summary = (await loadDocuments(root))[0];
	assert.equal(summary.metadata, null);
	assert.equal(summary.title, "Example title");
});

test("invalid inner JSON or structure fails the collection with a sanitized error", async (t) => {
	for (const value of ["private-inner-content", JSON.stringify({ metadata: "private-inner-content" })]) {
		const root = await mkdtemp(join(tmpdir(), "docs-test-"));
		t.after(() => rm(root, { recursive: true, force: true }));
		await writeDocument(root, "a", document());
		const input = document();
		input.fiche.structure_json = value;
		await writeDocument(root, "b", input);
		await assert.rejects(loadDocuments(root), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /Invalid fiche\.structure_json/);
			assert.doesNotMatch(error.message, /private-inner-content/);
			assert.equal(error.cause, undefined);
			return true;
		});
	}
});

test("preview prefers the central thesis and excludes metadata and later sections", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.fiche_md = "# Title\nAuthor: Example\n\n```md\n## Thèse centrale\nFake section\n```\n\n## Thèse centrale\nA **central** claim.\n### Evidence\nSupporting evidence.\n```md\n## Code heading\n```\n## Methods\nExcluded methods.";
	await writeDocument(root, "a", input);
	assert.equal((await loadDocuments(root))[0].preview, "A central claim. Supporting evidence.");
});

test("central thesis preview keeps the 600 character limit", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.fiche_md = "# Title\nAuthor: Example\n## Thèse centrale\n" + "Central claim. ".repeat(100);
	await writeDocument(root, "a", input);
	const summary = (await loadDocuments(root))[0];
	assert.ok(summary.preview.startsWith("Central claim."));
	assert.ok(summary.preview.length <= 600);
	assert.ok(summary.preview.endsWith("…"));
});

test("detail returns final Markdown and metadata without trace fields", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = document();
	input.fiche.structure_json = JSON.stringify(structure());
	input.fiche.fiche_md = "# Final title\n\n## Thèse centrale\nFinal claim.\n";
	input.fiche.intro_md = "private draft";
	input.note.note_md = "# Final note\n\nNote body.\n";
	input.note.prompt = "private prompt";
	input.note.dir = "/private/path";
	await writeDocument(root, "a", input);
	const summary = (await loadDocuments(root))[0];
	assert.deepEqual(await loadDocument("a", root), {
		...summary,
		ficheMarkdown: input.fiche.fiche_md,
		noteMarkdown: input.note.note_md,
		pdfUrl: null,
	});
	assert.deepEqual(summary.metadata, structure().metadata);
	assert.equal(summary.preview, "Final claim.");
});

test("detail returns null for missing documents and invalid IDs", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "empty"));
	for (const id of ["missing", "empty", "", ".", "..", "../a", "/tmp", "a/b", "a\\b", "%2e%2e", "a\0b"])
		assert.equal(await loadDocument(id, root), null, id);
});

test("detail rejects directory and file symlinks outside the document directory", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const explorer = join(root, "explorer");
	await mkdir(explorer);
	await writeDocument(root, "outside", document());
	await symlink(join(root, "outside"), join(explorer, "linked"));
	await mkdir(join(explorer, "file-link"));
	await symlink(join(root, "outside", "data.json"), join(explorer, "file-link", "data.json"));
	assert.equal(await loadDocument("linked", explorer), null);
	assert.equal(await loadDocument("file-link", explorer), null);
});

test("detail validates JSON and schemas without exposing paths or values", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "a"));
	for (const contents of ["private-invalid-content", JSON.stringify({ note: "private-invalid-content" }), JSON.stringify({ ...document(), fiche: { ...document().fiche, structure_json: "private-invalid-content" } })]) {
		await writeFile(join(root, "a", "data.json"), contents);
		await assert.rejects(loadDocument("a", root), (error: unknown) => {
			assert.ok(error instanceof Error);
			assert.doesNotMatch(error.message, /private-invalid-content/);
			assert.ok(!error.message.includes(root));
			assert.equal(error.cause, undefined);
			return true;
		});
	}
});

test("PDF URL permits missing, null, HTTP, and HTTPS values only", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "docs-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [index, pdf_url] of [undefined, null, "https://example.com/thesis.pdf", "http://example.com/thesis.pdf"].entries()) {
		const input = { ...document(), pdf_url };
		assert.equal(docsSchema.safeParse(input).success, true);
		await writeDocument(root, String(index), input);
		assert.equal((await loadDocument(String(index), root))?.pdfUrl, pdf_url ?? null);
	}
	for (const pdf_url of ["javascript:alert(1)", "data:application/pdf;base64,AA", "file:///private/file.pdf", "ftp://example.com/a.pdf", "/a.pdf", "not a URL", ""]) {
		assert.equal(docsSchema.safeParse({ ...document(), pdf_url }).success, false, pdf_url);
	}
	await writeDocument(root, "unsafe", { ...document(), pdf_url: "javascript:alert(1)" });
	await assert.rejects(loadDocument("unsafe", root), /Invalid document schema/);
});
