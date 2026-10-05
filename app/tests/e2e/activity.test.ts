import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { ficheMarkdown, iteration, placeholder, step, structure } from "../../workers/fake-generation/src/content.ts";
import { signUp, startApp } from "./helpers.ts";

test("activity retains summary sheet cards while the reading note generates", async (t) => {
	for (const url of [env.DATABASE_URL, env.S3_ENDPOINT]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
	}
	const origin = await startApp(t);
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const owner = await signUp(origin);
	const id = `e2e-activity-${randomUUID()}`;
	t.after(async () => {
		try {
			await pool.query("DELETE FROM documents WHERE id = $1", [id]);
			await pool.query('DELETE FROM "user" WHERE id = $1', [owner.id]);
		} finally {
			await pool.end();
		}
	});
	const data = placeholder(id, "Activity document");
	data.fiche.structure_json = structure(id, "Activity document");
	data.fiche.steps = [step(0, new Date().toISOString(), 38)];
	await pool.query("INSERT INTO documents (id, title, created_by, data) VALUES ($1, $2, $3, $4::jsonb)",
		[id, "Activity document", owner.id, JSON.stringify(docsSchema.parse(data))]);
	const html = async () => {
		const response = await fetch(`${origin}/en/documents/${id}`, { headers: { Cookie: owner.cookie } });
		assert.equal(response.status, 200);
		return response.text();
	};
	const cards = (text: string) => (text.match(/<details[^>]*class="group border bg-background"/g) ?? []).length;
	assert.equal(cards(await html()), 1);
	data.fiche.steps = Array.from({ length: 7 }, (_, index) => step(index, new Date().toISOString(), 38 + index));
	await pool.query("UPDATE documents SET data = $2::jsonb WHERE id = $1", [id, JSON.stringify(docsSchema.parse(data))]);
	assert.equal(cards(await html()), 7);
	data.fiche.fiche_md = ficheMarkdown;
	data.note.prompt = "Prepare the reading note.";
	data.note.iterations = [iteration(0, 75)];
	await pool.query("UPDATE documents SET data = $2::jsonb WHERE id = $1", [id, JSON.stringify(docsSchema.parse(data))]);
	const duringNote = await html();
	assert.equal(cards(duringNote), 9);
	assert.ok(duringNote.includes(`/en/documents/${id}/fiche`));
	assert.ok(duringNote.includes("lg:overflow-y-auto"));
	assert.ok(duringNote.includes("Iteration 1"));
	assert.ok(duringNote.includes("Introduction review"));
});
