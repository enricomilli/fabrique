import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { env } from "../../src/env.ts";
import { signUp, startApp } from "./helpers.ts";

test("signup permits only Pleias email domains", { timeout: 30000 }, async (t) => {
	assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname));
	const origin = await startApp(t);
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const ids: string[] = [];
	const emails: string[] = [];
	t.after(async () => {
		try {
			await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[]) OR email = ANY($2::text[])', [ids, emails]);
		} finally { await pool.end(); }
	});
	for (const domain of ["pleias.fr", "pleias.ai", "PLEIAS.FR"]) {
		ids.push((await signUp(origin, domain)).id);
	}
	for (const domain of ["example.com", "sub.pleias.fr", "pleias.fr.example.com", "fakepleias.ai"]) {
		const email = `e2e-${randomUUID()}@${domain}`;
		emails.push(email);
		const response = await fetch(`${origin}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body: JSON.stringify({ name: "E2E blocked signup", email, password: `E2e-${randomUUID()}` }),
		});
		assert.equal(response.status, 403, domain);
		const body: unknown = await response.json();
		assert.ok(body && typeof body === "object" && "message" in body);
		assert.equal(body.message, "You are not allowed to sign up.");
		assert.equal(response.headers.getSetCookie().length, 0);
		const result = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
		assert.equal(result.rowCount, 0);
	}
});
