import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { test } from "node:test";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { createPdf, signUp, startApp } from "./helpers.ts";

test("authenticated document upload and generation queue", { timeout: 90_000 }, async (t) => {
	for (const url of [env.DATABASE_URL, env.S3_ENDPOINT, env.REDIS_URL]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
	}
	const origin = await startApp(t);
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const s3 = new S3Client({
		endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
	});
	const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
	const queue = new Queue("document-generation", { connection });
	const users: string[] = [];
	t.after(async () => {
		try {
			const rows = await pool.query<{ id: string }>("SELECT id FROM documents WHERE created_by = ANY($1::text[])", [users]);
			const cleanup = await Promise.allSettled(rows.rows.flatMap(({ id }) => [
				queue.getJob(id).then(job => job?.remove()),
				s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: `pdfs/${id}.pdf` })),
			]));
			await pool.query("DELETE FROM documents WHERE created_by = ANY($1::text[])", [users]);
			await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
			for (const result of cleanup) {
				if (result.status === "rejected") throw result.reason;
			}
		} finally {
			s3.destroy();
			try { await queue.close(); } finally {
				connection.disconnect();
				await pool.end();
			}
		}
	});
	const owner = await signUp(origin);
	users.push(owner.id);
	const reader = await signUp(origin);
	users.push(reader.id);
	const pdf = createPdf();
	const request = (path: string, cookie = owner.cookie, init?: RequestInit) => fetch(origin + path, {
		...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: cookie, Origin: origin },
		redirect: "manual", signal: AbortSignal.timeout(20000),
	});
	const upload = (name: string, isPublic: boolean, body = pdf) => request(
		`/api/documents?filename=${encodeURIComponent(name)}&public=${isPublic}`, owner.cookie,
		{ method: "POST", headers: { "Content-Type": "application/pdf" }, body: new Uint8Array(body) },
	);

	await t.test("all app pages redirect signed-out users to login", async () => {
		for (const path of ["/en/", "/en/my-documents", "/en/documents/new", "/en/documents/missing", "/en/documents/missing/fiche", "/en/feedback"]) {
			const response = await request(path, "");
			assert.ok([302, 303, 307].includes(response.status), `${path}: ${response.status}`);
			assert.match(response.headers.get("location") ?? "", /\/login/);
		}
		assert.equal((await request("/en/login", "")).status, 200);
		const response = await request("/api/documents?filename=paper.pdf", "", {
			method: "POST", headers: { "Content-Type": "application/pdf" }, body: new Uint8Array(pdf),
		});
		assert.equal(response.status, 401);
	});

	await t.test("home and upload pages show English and French labels", async () => {
		for (const [locale, mine, publicTitle, uploadTitle] of [
			["en", "My documents", "Public documents", "Make this document public"],
			["fr", "Mes documents", "Documents publics", "Rendre ce document public"],
		]) {
			const home = await request(`/${locale}/`);
			assert.equal(home.status, 200);
			const html = await home.text();
			assert.ok(html.includes(mine), mine);
			assert.ok(html.includes(publicTitle), publicTitle);
			assert.ok(html.indexOf(mine) < html.indexOf(publicTitle));
			const page = await request(`/${locale}/documents/new`);
			assert.equal(page.status, 200);
			assert.ok((await page.text()).includes(uploadTitle), uploadTitle);
		}
	});

	let privateId = "";
	let publicId = "";
	await t.test("upload stores an owned pending document, S3 PDF, and waiting BullMQ job", async () => {
		for (const isPublic of [false, true]) {
			const filename = `academic-${owner.id}-${isPublic}.pdf`;
			const response = await upload(filename, isPublic);
			const result: unknown = await response.json();
			assert.equal(response.status, 201, JSON.stringify(result));
			assert.ok(result && typeof result === "object" && "id" in result && typeof result.id === "string");
			const id = result.id;
			if (isPublic) publicId = id; else privateId = id;
			const row = await pool.query<{ title: string; created_by: string; public: boolean; generation_completed: boolean; data: unknown }>(
				"SELECT title, created_by, public, generation_completed, data FROM documents WHERE id = $1", [id],
			);
			assert.deepEqual(row.rows[0], { title: filename, created_by: owner.id, public: isPublic, generation_completed: false, data: null });
			const object = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: `pdfs/${id}.pdf` }));
			assert.deepEqual(Buffer.from(await object.Body!.transformToByteArray()), pdf);
			const job = await queue.getJob(id);
			assert.ok(job);
			assert.equal(job.name, "generate-document");
			assert.deepEqual(job.data, { documentId: id, userId: owner.id, bucket: env.S3_BUCKET, key: `pdfs/${id}.pdf` });
			assert.equal(await job.getState(), "waiting");
		}
	});

	await t.test("multipart uploads preserve every PDF byte", async () => {
		const largePdf = createPdf(9 * 1024 * 1024);
		const response = await upload("multipart.pdf", false, largePdf);
		const result: unknown = await response.json();
		assert.equal(response.status, 201, JSON.stringify(result));
		assert.ok(result && typeof result === "object" && "id" in result && typeof result.id === "string");
		const downloaded = await request(`/api/pdfs/${result.id}`);
		assert.equal(downloaded.status, 200);
		assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), largePdf);
	});

	await t.test("ownership controls private pages and PDFs while public documents remain visible", async () => {
		assert.ok(privateId && publicId);
		for (const suffix of ["", "/fiche", "/note"]) {
			const page = await request(`/en/documents/${privateId}${suffix}`);
			assert.equal(page.status, 200);
			assert.match(await page.text(), /Queued for generation/);
			assert.equal((await request(`/en/documents/${privateId}${suffix}`, reader.cookie)).status, 404);
		}
		assert.equal((await request(`/api/pdfs/${privateId}`)).status, 200);
		assert.equal((await request(`/api/pdfs/${privateId}`, reader.cookie)).status, 404);
		assert.equal((await request(`/api/pdfs/${publicId}`, reader.cookie)).status, 200);
		assert.equal((await request(`/en/documents/${publicId}`, reader.cookie)).status, 200);
		const ownerHome = await (await request("/en/")).text();
		assert.ok(ownerHome.includes(privateId));
		assert.ok(ownerHome.includes(publicId));
		const readerHome = await (await request("/en/", reader.cookie)).text();
		assert.ok(!readerHome.includes(privateId));
		assert.ok(!readerHome.includes(publicId));
		for (const locale of ["en", "fr"]) {
			const ownedPage = await request(`/${locale}/my-documents`);
			assert.equal(ownedPage.status, 200);
			const ownedHtml = await ownedPage.text();
			assert.ok(ownedHtml.includes(privateId));
			assert.ok(ownedHtml.includes(publicId));
			const otherPage = await request(`/${locale}/my-documents`, reader.cookie);
			assert.equal(otherPage.status, 200);
			const otherHtml = await otherPage.text();
			assert.ok(!otherHtml.includes(privateId));
			assert.ok(!otherHtml.includes(publicId));
		}
		await pool.query("UPDATE documents SET deleted_at = now() WHERE id = $1", [privateId]);
		assert.equal((await request(`/api/pdfs/${privateId}`)).status, 404);
		assert.equal((await request(`/en/documents/${privateId}`)).status, 404);
	});

	await t.test("invalid PDFs and cross-origin requests do not create documents", async () => {
		const before = await pool.query<{ count: string }>("SELECT count(*) FROM documents WHERE created_by = $1", [owner.id]);
		for (const [name, body] of [["bad.txt", pdf], ["bad.pdf", Buffer.from("not a PDF document")]] as const) {
			assert.equal((await upload(name, false, body)).status, 400);
		}
		const foreign = await fetch(`${origin}/api/documents?filename=paper.pdf`, {
			method: "POST", headers: { Cookie: owner.cookie, Origin: "https://untrusted.example", "Content-Type": "application/pdf" },
			body: new Uint8Array(pdf),
		});
		assert.equal(foreign.status, 403);
		const after = await pool.query<{ count: string }>("SELECT count(*) FROM documents WHERE created_by = $1", [owner.id]);
		assert.equal(before.rows[0].count, after.rows[0].count);
	});

	await t.test("declared uploads above 1.5 GB receive 413 before transfer", async () => {
		const status = await new Promise<number | undefined>((resolve, reject) => {
			const outgoing = httpRequest(`${origin}/api/documents?filename=large.pdf`, {
				method: "POST", headers: { Cookie: owner.cookie, Origin: origin, "Content-Type": "application/pdf", "Content-Length": "1500000001" },
			}, response => { response.resume(); response.on("end", () => { resolve(response.statusCode); outgoing.destroy(); }); });
			outgoing.setTimeout(5000, () => { outgoing.destroy(new Error("Upload rejection timed out.")); });
			outgoing.on("error", reject);
			outgoing.end(pdf);
		});
		assert.equal(status, 413);
	});
});
