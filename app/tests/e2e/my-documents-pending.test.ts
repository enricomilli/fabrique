import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { signUp, startApp } from "./helpers.ts";

test("the homepage shows owned documents in generation before completed documents", { timeout: 90_000 }, async (t) => {
	assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname));
	const origin = await startApp(t);
	const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
	const users: string[] = [];
	t.after(async () => {
		try {
			await pool.query("DELETE FROM documents WHERE created_by = ANY($1::text[])", [users]);
			await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
		} finally {
			await pool.end();
		}
	});
	const owner = await signUp(origin);
	users.push(owner.id);
	const reader = await signUp(origin);
	users.push(reader.id);
	const source: unknown = JSON.parse(await readFile("workers/fake-generation/fixtures/data.json", "utf8"));
	const data = docsSchema.parse(source);
	const completedIds: string[] = [];
	const pendingIds: string[] = [];
	for (let index = 0; index < 4; index++) {
		const id = `e2e-completed-${randomUUID()}`;
		completedIds.push(id);
		await pool.query(
			"INSERT INTO documents (id, title, created_by, generation_completed, data) VALUES ($1, $2, $3, true, $4::jsonb)",
			[id, "Completed document", owner.id, JSON.stringify({ ...data, generated: `2026-01-0${index + 1}` })],
		);
	}
	const section = async (cookie: string): Promise<string> => {
		const response = await fetch(`${origin}/en/`, {
			headers: { Cookie: cookie }, signal: AbortSignal.timeout(20_000),
		});
		assert.equal(response.status, 200);
		const html = await response.text();
		const match = html.match(/<section\b[^>]*aria-labelledby="my-documents"[^>]*>[\s\S]*?<\/section>/);
		assert.ok(match, "The homepage must show the My documents section.");
		return match[0];
	};
	const addPending = async (): Promise<string> => {
		const id = `e2e-pending-${randomUUID()}`;
		pendingIds.push(id);
		await pool.query(
			"INSERT INTO documents (id, title, created_by, generation_completed) VALUES ($1, $2, $3, false)",
			[id, "Document in generation", owner.id],
		);
		return id;
	};
	await t.test("without pending documents the homepage shows three recent completed documents", async () => {
		const html = await section(owner.cookie);
		assert.equal(completedIds.filter((id) => html.includes(id)).length, 3);
		assert.ok(!html.includes(completedIds[0]));
	});
	await t.test("a pending document appears before two completed documents", async () => {
		const pendingId = await addPending();
		const html = await section(owner.cookie);
		assert.ok(html.includes(pendingId));
		assert.match(html, /Queued for generation/);
		const visibleCompleted = completedIds.filter((id) => html.includes(id));
		assert.equal(visibleCompleted.length, 2);
		for (const id of visibleCompleted) assert.ok(html.indexOf(pendingId) < html.indexOf(id));
		assert.ok(!(await section(reader.cookie)).includes(pendingId));
	});
	await t.test("all pending documents remain visible when they exceed three", async () => {
		for (let index = 0; index < 3; index++) await addPending();
		const html = await section(owner.cookie);
		for (const id of pendingIds) assert.ok(html.includes(id));
		for (const id of completedIds) assert.ok(!html.includes(id));
	});
});
