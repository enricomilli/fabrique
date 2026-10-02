import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { createPdf, signUp, startApp } from "./helpers.ts";

test("PDF HTTP routes use local PostgreSQL and S3", { timeout: 60_000 }, async (t) => {
	for (const url of [env.DATABASE_URL, env.S3_ENDPOINT]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
			"PDF tests require local database and S3 endpoints.");
	}
	const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
	const s3 = new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
		maxAttempts: 1,
	});
	const prefix = `pdf-e2e-${randomUUID()}`;
	const ids = {
		public: `${prefix}-public`, private: `${prefix}-private`,
		deleted: `${prefix}-deleted`, missingObject: `${prefix}-missing-object`,
		orphan: `${prefix}-orphan`, missing: `${prefix}-missing`,
	};
	const uploadedIds = [ids.public, ids.private, ids.deleted, ids.orphan];
	const content = createPdf();

	// Delete only this run's rows and objects, including after a failed test.
	t.after(async () => {
		try {
			const results = await Promise.allSettled([
				pool.query("DELETE FROM documents WHERE id = ANY($1::text[])", [Object.values(ids)]),
				...uploadedIds.map(id => s3.send(new DeleteObjectCommand({
					Bucket: env.S3_BUCKET, Key: `pdfs/${id}.pdf`,
				}))),
			]);
			for (const result of results) {
				if (result.status === "rejected") throw result.reason;
			}
		} finally {
			s3.destroy();
			await pool.end();
		}
	});

	const data = {
		generated: "2026-01-01",
		fiche: {
			dir: "", fiche_md: "# PDF test", has_full_calls: false,
			intro_md: "", steps: [], structure_json: "", thesis: prefix,
		},
		note: {
			config: {
				blob_chars: 0, blob_tok_est: 0, fiche_path: "", model: "",
				parquet_path: "", prompt_chars: 0, rlm_config: "", run_id: "",
				shim_env: { GEMMA_SERVER_URL: "" }, thesis: prefix,
			},
			dir: "", iterations: [],
			metadata: {
				iterations: 0, note_word_count: 0, rlm_status: "", rlm_time_s: 0,
				run_dir: "", sub_queries: 0, trace_files: 0, trace_root_calls: 0,
				trace_subquery_calls: 0, wall_time_s: 0,
			},
			note_md: "", prompt: "", rlm_stdout: "", run_id: "", thesis: prefix,
		},
	};
	await pool.query(
		`INSERT INTO documents (id, data, public, deleted_at) VALUES
		 ($1, $5::jsonb, true, NULL), ($2, $5::jsonb, false, NULL),
		 ($3, $5::jsonb, true, now()), ($4, $5::jsonb, true, NULL)`,
		[ids.public, ids.private, ids.deleted, ids.missingObject, JSON.stringify(data)],
	);
	for (const id of uploadedIds) {
		await s3.send(new PutObjectCommand({
			Bucket: env.S3_BUCKET, Key: `pdfs/${id}.pdf`, Body: content, ContentType: "application/pdf",
		}));
	}

	const origin = await startApp(t);
	const user = await signUp(origin);
	t.after(async () => {
		const cleanup = new Pool({ connectionString: env.DATABASE_URL });
		try { await cleanup.query('DELETE FROM "user" WHERE id = $1', [user.id]); }
		finally { await cleanup.end(); }
	});
	const request = (id: string, init?: RequestInit) => fetch(`${origin}/api/pdfs/${encodeURIComponent(id)}`, {
		...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: user.cookie },
		signal: AbortSignal.timeout(5000), redirect: "manual",
	});
	await t.test("signed-out readers cannot download public PDFs", async () => {
		const response = await fetch(`${origin}/api/pdfs/${ids.public}`);
		assert.equal(response.status, 401);
	});

	await t.test("GET returns the exact S3 object and PDF headers", async () => {
		const response = await request(ids.public);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-type"), "application/pdf");
		assert.equal(response.headers.get("content-length"), String(content.length));
		assert.equal(response.headers.get("content-disposition"), `inline; filename="${ids.public}.pdf"`);
		assert.equal(response.headers.get("accept-ranges"), "bytes");
		assert.equal(response.headers.get("cache-control"), "no-store");
		assert.equal(response.headers.get("x-content-type-options"), "nosniff");
		assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
	});

	await t.test("HEAD returns metadata without a body", async () => {
		const response = await request(ids.public, { method: "HEAD", headers: { Range: "bytes=0-7" } });
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-length"), String(content.length));
		assert.equal((await response.arrayBuffer()).byteLength, 0);
	});

	await t.test("ranges return the correct S3 bytes", async () => {
		const ranges: Array<[string, number, number]> = [
			["bytes=0-7", 0, 7], ["bytes=8-", 8, content.length - 1],
			["bytes=-8", content.length - 8, content.length - 1],
		];
		for (const [range, start, end] of ranges) {
			const response = await request(ids.public, { headers: { Range: range } });
			assert.equal(response.status, 206);
			assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${content.length}`);
			assert.equal(response.headers.get("content-length"), String(end - start + 1));
			assert.deepEqual(Buffer.from(await response.arrayBuffer()), content.subarray(start, end + 1));
		}
	});

	await t.test("unsatisfied ranges return 416", async () => {
		const response = await request(ids.public, { headers: { Range: `bytes=${content.length}-` } });
		assert.equal(response.status, 416);
		assert.equal(response.headers.get("content-range"), `bytes */${content.length}`);
		assert.equal((await response.arrayBuffer()).byteLength, 0);
	});

	await t.test("unsupported and conditional ranges return the complete PDF", async () => {
		const cases: HeadersInit[] = [
			{ Range: "bytes=0-1,4-5" }, { Range: "bytes=invalid" },
			{ Range: "items=0-2" }, { Range: "bytes=0-1", "If-Range": '"old"' },
		];
		for (const headers of cases) {
			const response = await request(ids.public, { headers });
			assert.equal(response.status, 200);
			assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
		}
	});

	await t.test("private, deleted, missing, and orphan PDFs return 404", async () => {
		for (const id of [ids.private, ids.deleted, ids.missingObject, ids.orphan, ids.missing, `${prefix}/invalid`]) {
			for (const method of ["GET", "HEAD"]) {
				const response = await request(id, { method });
				assert.equal(response.status, 404, `${id} ${method}`);
				assert.equal(await response.text(), method === "HEAD" ? "" : "PDF not found.");
			}
		}
	});

	await t.test("database visibility changes apply to subsequent requests", async () => {
		await pool.query("UPDATE documents SET public = false WHERE id = $1", [ids.public]);
		assert.equal((await request(ids.public, { method: "HEAD" })).status, 404);
		await pool.query("UPDATE documents SET public = true, deleted_at = now() WHERE id = $1", [ids.public]);
		assert.equal((await request(ids.public, { method: "HEAD" })).status, 404);
		await pool.query("UPDATE documents SET deleted_at = NULL WHERE id = $1", [ids.public]);
		assert.equal((await request(ids.public, { method: "HEAD" })).status, 200);
	});
});
