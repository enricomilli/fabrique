import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { defaultSerovalDeserializerPlugins } from "@tanstack/router-core/ssr/client";
import { Pool } from "pg";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { signUp, startApp } from "./helpers.ts";

type Action = "updateDocumentVisibility" | "deleteDocument" | "getDocuments" | "getMyDocuments" | "getDocument";
type DocumentState = { public: boolean; deleted_at: Date | null; created_by: string; data: unknown };

async function getFunctionIds(): Promise<Record<Action, string>> {
	const manifest = await readFile(".output/server/_ssr/ssr.mjs", "utf8");
	const getId = (name: Action): string => {
		const match = manifest.match(new RegExp(`"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`));
		assert.ok(match, `Build the app with the ${name} server function before this test.`);
		return match[1];
	};
	return {
		updateDocumentVisibility: getId("updateDocumentVisibility"),
		deleteDocument: getId("deleteDocument"),
		getDocuments: getId("getDocuments"),
		getMyDocuments: getId("getMyDocuments"),
		getDocument: getId("getDocument"),
	};
}

test("document actions enforce ownership and update document visibility", { timeout: 90_000 }, async (t) => {
	assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname), "Use a local PostgreSQL database.");
	const ids = await getFunctionIds();
	const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
	const users: string[] = [];
	const documentId = `e2e-actions-${randomUUID()}`;
	t.after(async () => {
		try {
			await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
			await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
		} finally {
			await pool.end();
		}
	});
	await pool.query("SELECT 1");
	const origin = await startApp(t);
	const owner = await signUp(origin);
	users.push(owner.id);
	const reader = await signUp(origin);
	users.push(reader.id);
	const source: unknown = JSON.parse(await readFile("workers/fake-generation/fixtures/data.json", "utf8"));
	const data = docsSchema.parse(source);
	// The fixture URL prevents PDF storage requests. This test does not start a worker.
	data.pdf_url = `${origin}/fixture.pdf`;
	await pool.query(
		"INSERT INTO documents (id, title, created_by, public, generation_completed, data) VALUES ($1, $2, $3, false, true, $4::jsonb)",
		[documentId, "Document actions fixture", owner.id, JSON.stringify(data)],
	);
	const state = async (): Promise<DocumentState> => {
		const result = await pool.query<DocumentState>("SELECT public, deleted_at, created_by, data FROM documents WHERE id = $1", [documentId]);
		assert.equal(result.rowCount, 1, "The document row must remain in PostgreSQL.");
		return result.rows[0];
	};
	const request = (path: string, cookie: string) => fetch(origin + path, {
		headers: { Cookie: cookie, Origin: origin }, redirect: "manual", signal: AbortSignal.timeout(20_000),
	});
	// Start uses Seroval JSON, the payload query parameter, and the x-tsr-serverFn header.
	const call = async (name: Action, cookie: string, input?: { id: string; public?: boolean }): Promise<unknown> => {
		const method = name === "deleteDocument" || name === "updateDocumentVisibility" ? "POST" : "GET";
		const payload = JSON.stringify(await toJSONAsync(input ? { data: input } : {}));
		const url = new URL(`/_serverFn/${ids[name]}`, origin);
		if (method === "GET") url.searchParams.set("payload", payload);
		const response = await fetch(url, {
			method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "x-tsr-serverFn": "true" },
			body: method === "POST" ? payload : undefined, redirect: "manual", signal: AbortSignal.timeout(20_000),
		});
		assert.match(response.headers.get("content-type") ?? "", /application\/json/);
		const result: unknown = fromCrossJSON(await response.json(), { plugins: defaultSerovalDeserializerPlugins });
		if (result instanceof Error) throw result;
		assert.equal(response.status, 200);
		assert.ok(result && typeof result === "object");
		if ("error" in result && result.error !== undefined) throw result.error;
		return "result" in result ? result.result : undefined;
	};
	const listed = async (name: "getDocuments" | "getMyDocuments", cookie: string): Promise<boolean> => {
		const result = await call(name, cookie);
		assert.ok(Array.isArray(result));
		return result.some((item: unknown) => typeof item === "object" && item !== null && "id" in item && item.id === documentId);
	};
	const checkVisibility = async (isPublic: boolean, deleted = false): Promise<void> => {
		for (const user of [owner, reader]) {
			assert.equal(await listed("getDocuments", user.cookie), isPublic && !deleted);
			assert.equal(await listed("getMyDocuments", user.cookie), user === owner && !deleted);
			const detail = await call("getDocument", user.cookie, { id: documentId });
			assert.equal(detail !== null, !deleted && (isPublic || user === owner));
			if (detail !== null) {
				assert.ok(detail && typeof detail === "object" && "public" in detail);
				assert.equal(detail.public, isPublic);
			}
			for (const suffix of ["", "/fiche", "/note"]) {
				const response = await request(`/en/documents/${documentId}${suffix}`, user.cookie);
				assert.equal(response.status, !deleted && (isPublic || user === owner) ? 200 : 404);
				await response.text();
			}
			for (const path of ["/en/", "/en/my-documents"]) {
				const response = await request(path, user.cookie);
				assert.equal(response.status, 200);
				const visible = !deleted && (user === owner || (path === "/en/" && isPublic));
				assert.equal((await response.text()).includes(documentId), visible);
			}
		}
	};
	const denyActions = async (isPublic: boolean): Promise<void> => {
		const before = await state();
		for (const [cookie, message] of [[reader.cookie, /Cannot change this document/], ["", /Unauthorized/]] as const) {
			await assert.rejects(call("updateDocumentVisibility", cookie, { id: documentId, public: !isPublic }), message);
			await assert.rejects(call("deleteDocument", cookie, { id: documentId }), cookie ? /Cannot delete this document/ : /Unauthorized/);
			assert.deepEqual(await state(), before);
		}
	};

	await t.test("private documents deny non-owner and unauthenticated actions", async () => {
		await checkVisibility(false);
		await denyActions(false);
	});
	await t.test("the owner makes a document public", async () => {
		await call("updateDocumentVisibility", owner.cookie, { id: documentId, public: true });
		assert.equal((await state()).public, true);
		await checkVisibility(true);
		await denyActions(true);
	});
	await t.test("the owner makes a public document private", async () => {
		await call("updateDocumentVisibility", owner.cookie, { id: documentId, public: false });
		assert.equal((await state()).public, false);
		await checkVisibility(false);
	});
	await t.test("soft deletion hides a public document from all lists and pages", async () => {
		await call("updateDocumentVisibility", owner.cookie, { id: documentId, public: true });
		const before = await state();
		await call("deleteDocument", owner.cookie, { id: documentId });
		const after = await state();
		assert.ok(after.deleted_at instanceof Date);
		assert.equal(after.public, false);
		assert.equal(after.created_by, owner.id);
		assert.deepEqual(after.data, before.data);
		await checkVisibility(false, true);
		await assert.rejects(call("updateDocumentVisibility", owner.cookie, { id: documentId, public: true }), /Cannot change this document/);
		await assert.rejects(call("deleteDocument", owner.cookie, { id: documentId }), /Cannot delete this document/);
		assert.deepEqual(await state(), after);
	});
});
