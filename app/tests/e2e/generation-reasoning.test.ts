import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { reasoningSchema } from "../../src/lib/reasoning.schema.ts";
import { signUp, startApp } from "./helpers.ts";

test("generation saves progressive reasoning and shows shared iteration content", { timeout: 60_000 }, async (t) => {
	for (const url of [env.DATABASE_URL, env.REDIS_URL, env.S3_ENDPOINT]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
	}
	const origin = await startApp(t);
	const owner = await signUp(origin);
	const id = randomUUID();
	const queueName = `e2e-reasoning-${id}`;
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
	const queue = new Queue(queueName, { connection: redis });
	const worker = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
		cwd: "workers/fake-generation",
		env: { ...process.env, FAKE_GENERATION_ENABLED: "true", GENERATION_QUEUE_NAME: queueName, FAKE_GENERATION_DURATION_MS: "6000" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let logs = "";
	worker.stdout.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
	worker.stderr.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
	const exited = once(worker, "exit");
	t.after(async () => {
		worker.kill("SIGTERM");
		const force = setTimeout(() => worker.kill("SIGKILL"), 8000);
		try { await exited; } finally { clearTimeout(force); }
		await queue.obliterate({ force: true });
		await queue.close();
		redis.disconnect();
		await pool.query("DELETE FROM documents WHERE id = $1", [id]);
		await pool.query('DELETE FROM "user" WHERE id = $1', [owner.id]);
		await pool.end();
	});
	await pool.query("INSERT INTO documents (id, title, created_by) VALUES ($1, $2, $3)", [id, "Reasoning demo", owner.id]);
	await queue.add("generate-document", { documentId: id, userId: owner.id, bucket: env.S3_BUCKET, key: `pdfs/${id}.pdf` });
	let sawPartial = false;
	let sawContent = false;
	let completed = false;
	for (let attempt = 0; attempt < 600; attempt++) {
		assert.equal(worker.exitCode, null, logs);
		const row = (await pool.query<{ data: unknown; reasoning: unknown; generation_completed: boolean }>(
			"SELECT data, reasoning, generation_completed FROM documents WHERE id = $1", [id],
		)).rows[0];
		if (row.reasoning !== null) {
			const data = docsSchema.parse(row.data);
			const reasoning = reasoningSchema.parse(row.reasoning);
			const iterations = reasoning.sections.find((section) => section.id === "iterations");
			assert.ok(iterations);
			assert.equal(iterations.data.items.length, data.note.iterations.length);
			assert.deepEqual(iterations.data.items.map((item) => item.seconds), data.note.iterations.map((item) => item.elapsed_s));
			if (!row.generation_completed) {
				assert.deepEqual(reasoning.sections.map((section) => section.id), ["iterations"]);
				sawPartial ||= iterations.data.items.length < 9;
				if (!sawContent) {
					const response = await fetch(`${origin}/en/documents/${id}`, { headers: { Cookie: owner.cookie } });
					assert.equal(response.status, 200);
					const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
					assert.match(html, /data-reasoning-iteration/);
					assert.match(html, /Intention/);
					assert.match(html, /Feedback/);
					sawContent = true;
				}
			} else {
				assert.equal(reasoning.sections.length, 7);
				assert.equal(iterations.data.items.length, 9);
				const bars = reasoning.sections.find((section) => section.id === "iteration_bars");
				assert.deepEqual(bars?.data.items.map((item) => item.seconds), iterations.data.items.map((item) => item.seconds));
				completed = true;
				break;
			}
		}
		await delay(25);
	}
	assert.ok(sawPartial);
	assert.ok(sawContent);
	assert.ok(completed, logs);
});
