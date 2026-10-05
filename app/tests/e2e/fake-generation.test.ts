import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { createPdf, signUp, startApp } from "./helpers.ts";

test("fake worker saves live progress and makes the summary sheet available before completion", { timeout: 90_000 }, async (t) => {
	for (const url of [env.DATABASE_URL, env.S3_ENDPOINT, env.REDIS_URL]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
	}
	const origin = await startApp(t);
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
	const uploadQueue = new Queue("document-generation", { connection: redis });
	const queueName = `e2e-generation-${randomUUID()}`;
	const queue = new Queue(queueName, { connection: redis });
	const s3 = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } });
	const owner = await signUp(origin);
	let documentId = "";
	t.after(async () => {
		try {
			if (documentId) {
				await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: `pdfs/${documentId}.pdf` }));
				await (await uploadQueue.getJob(documentId))?.remove();
				await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
			}
			await pool.query('DELETE FROM "user" WHERE id = $1', [owner.id]);
			await queue.obliterate({ force: true });
		} finally {
			s3.destroy();
			await queue.close();
			await uploadQueue.close();
			redis.disconnect();
			await pool.end();
		}
	});
	const request = (path: string, cookie = owner.cookie) => fetch(origin + path, { headers: { Cookie: cookie }, redirect: "manual" });
	const upload = await fetch(`${origin}/api/documents?filename=demo.pdf&public=false`, {
		method: "POST", headers: { Cookie: owner.cookie, Origin: origin, "Content-Type": "application/pdf" }, body: new Uint8Array(createPdf()),
	});
	assert.equal(upload.status, 201);
	const result: unknown = await upload.json();
	assert.ok(result && typeof result === "object" && "id" in result && typeof result.id === "string");
	documentId = result.id;
	const originalJob = await uploadQueue.getJob(documentId);
	assert.ok(originalJob);
	await originalJob.remove();
	await queue.add("generate-document", { documentId, userId: owner.id, bucket: env.S3_BUCKET, key: `pdfs/${documentId}.pdf` }, { jobId: documentId });
	const worker = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
		cwd: "workers/fake-generation", env: { ...process.env, FAKE_GENERATION_ENABLED: "true", GENERATION_QUEUE_NAME: queueName, FAKE_GENERATION_DELAY_MS: "250" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let logs = "";
	worker.stdout.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
	worker.stderr.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
	const exited = once(worker, "exit");
	t.after(async () => {
		if (worker.exitCode === null && worker.signalCode === null) {
			worker.kill("SIGTERM");
			const force = setTimeout(() => worker.kill("SIGKILL"), 5000);
			try { await exited; } finally { clearTimeout(force); }
		}
	});
	let sawStructure = false;
	let sawEarlyFiche = false;
	let completed = false;
	for (let attempt = 0; attempt < 500; attempt++) {
		assert.equal(worker.exitCode, null, logs);
		const row = (await pool.query<{ data: unknown; generation_completed: boolean; created_by: string; public: boolean }>(
			"SELECT data, generation_completed, created_by, public FROM documents WHERE id = $1", [documentId],
		)).rows[0];
		assert.equal(row.created_by, owner.id);
		assert.equal(row.public, false);
		if (row.data) {
			const data = docsSchema.parse(row.data);
			sawStructure ||= Boolean(data.fiche.structure_json.trim()) && !row.generation_completed;
			if (data.fiche.fiche_md.trim() && !row.generation_completed && !sawEarlyFiche) {
				sawEarlyFiche = true;
				const fiche = await request(`/en/documents/${documentId}/fiche`);
				assert.equal(fiche.status, 200);
				assert.match(await fiche.text(), /demo/i);
				const progress = await request(`/fr/documents/${documentId}`);
				assert.equal(progress.status, 200);
				assert.match(await progress.text(), /AVANCEMENT|Avancement/);
			}
			if (row.generation_completed) {
				assert.ok(data.fiche.fiche_md.trim());
				assert.ok(data.note.note_md.trim());
				assert.ok(data.note.iterations.length > 0);
				completed = true;
				break;
			}
		}
		await delay(50);
	}
	assert.ok(sawStructure, "The worker must save structure before completion.");
	assert.ok(sawEarlyFiche, "The summary sheet must exist before completion.");
	assert.ok(completed, logs);
	assert.equal((await request(`/en/documents/${documentId}/note`)).status, 200);
	assert.ok([302, 303, 307].includes((await request(`/en/documents/${documentId}`, "")).status));
});
