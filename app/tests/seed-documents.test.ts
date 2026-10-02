import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { getSeedPaths, readSeedDocuments, writeSeedDocuments } from "../scripts/seed-documents.ts";
import type { Docs } from "../src/lib/docs.schema.ts";

const document: Docs = {
	generated: "2026-01-01T00:00:00Z",
	fiche: {
		dir: "", fiche_md: "# Example", has_full_calls: false, intro_md: "",
		steps: [], structure_json: "", thesis: "example",
	},
	note: {
		config: {
			blob_chars: 0, blob_tok_est: 0, fiche_path: "", model: "", parquet_path: "",
			prompt_chars: 0, rlm_config: "", run_id: "", shim_env: { GEMMA_SERVER_URL: "" }, thesis: "example",
		},
		dir: "", iterations: [],
		metadata: {
			iterations: 0, note_word_count: 0, rlm_status: "", rlm_time_s: 0,
			run_dir: "", sub_queries: 0, trace_files: 0, trace_root_calls: 0,
			trace_subquery_calls: 0, wall_time_s: 0,
		},
		note_md: "", prompt: "", rlm_stdout: "", run_id: "", thesis: "example",
	},
};

async function fixture(t: TestContext) {
	const root = await mkdtemp(join(tmpdir(), "seed-documents-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const paths = { explorerDir: join(root, "explorer"), pdfDir: join(root, "pdf") };
	await mkdir(join(paths.explorerDir, "example"), { recursive: true });
	await mkdir(paths.pdfDir);
	await writeFile(join(paths.explorerDir, "example", "data.json"), JSON.stringify(document));
	await writeFile(join(paths.pdfDir, "example.pdf"), "%PDF-1.7\nfixture\n%%EOF\n");
	return paths;
}

test("seed paths use local defaults, environment overrides, and explicit paths", () => {
	const originalExplorer = process.env.EXPLORER_DIR;
	const originalPdf = process.env.PDF_DIR;
	try {
		delete process.env.EXPLORER_DIR;
		delete process.env.PDF_DIR;
		assert.deepEqual(getSeedPaths(), {
			explorerDir: resolve("../explorer"), pdfDir: resolve("../data/pdf"),
		});
		process.env.EXPLORER_DIR = resolve("custom-explorer");
		process.env.PDF_DIR = resolve("custom-pdf");
		assert.deepEqual(getSeedPaths(), {
			explorerDir: process.env.EXPLORER_DIR, pdfDir: process.env.PDF_DIR,
		});
		assert.deepEqual(getSeedPaths({ explorerDir: "./source", pdfDir: "./pdf" }), {
			explorerDir: resolve("source"), pdfDir: resolve("pdf"),
		});
		assert.throws(() => getSeedPaths({ explorerDir: " " }));
	} finally {
		if (originalExplorer === undefined) delete process.env.EXPLORER_DIR;
		else process.env.EXPLORER_DIR = originalExplorer;
		if (originalPdf === undefined) delete process.env.PDF_DIR;
		else process.env.PDF_DIR = originalPdf;
	}
});

test("seed validates documents and matching PDF signatures", async (t) => {
	const paths = await fixture(t);
	const records = await readSeedDocuments(paths);
	assert.equal(records.length, 1);
	assert.equal(records[0].id, "example");
	assert.deepEqual(records[0].data, document);
	assert.ok(records[0].pdf && records[0].pdf.size > 0);
});

test("missing PDFs are optional, but invalid PDFs fail validation", async (t) => {
	const paths = await fixture(t);
	const pdfPath = join(paths.pdfDir, "example.pdf");
	await rm(pdfPath);
	assert.equal((await readSeedDocuments(paths))[0].pdf, null);
	for (const content of ["", "not a PDF"]) {
		await writeFile(pdfPath, content);
		await assert.rejects(readSeedDocuments(paths), /Invalid PDF signature/);
	}
});

test("invalid JSON, document fields, and nested fiche structures fail validation", async (t) => {
	const paths = await fixture(t);
	const path = join(paths.explorerDir, "example", "data.json");
	for (const content of [
		"{invalid", "{}",
		JSON.stringify({ ...document, fiche: { ...document.fiche, structure_json: "{}" } }),
	]) {
		await writeFile(path, content);
		await assert.rejects(readSeedDocuments(paths), /Invalid/);
	}
});

test("PDF symlinks cannot escape the configured directory", async (t) => {
	const paths = await fixture(t);
	const outside = join(paths.explorerDir, "outside.pdf");
	await writeFile(outside, "%PDF-1.7\n");
	await rm(join(paths.pdfDir, "example.pdf"));
	await symlink(outside, join(paths.pdfDir, "example.pdf"));
	await assert.rejects(readSeedDocuments(paths), /Invalid PDF path/);
});

test("seed uploads before upserts and uses stable keys on repeat runs", async (t) => {
	const records = await readSeedDocuments(await fixture(t));
	const calls: string[] = [];
	const writer = {
		async uploadPdf(key: string) { calls.push(`upload:${key}`); },
		async upsertDocument(record: { id: string }) { calls.push(`upsert:${record.id}`); },
	};
	await writeSeedDocuments(records, writer);
	await writeSeedDocuments(records, writer);
	assert.deepEqual(calls, [
		"upload:pdfs/example.pdf", "upsert:example",
		"upload:pdfs/example.pdf", "upsert:example",
	]);
	await assert.rejects(writeSeedDocuments(records, {
		async uploadPdf() { throw new Error("Upload failed."); },
		async upsertDocument() { assert.fail("The database write must not run."); },
	}), /Upload failed/);
});
