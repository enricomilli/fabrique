import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { defaultSerovalDeserializerPlugins } from "@tanstack/router-core/ssr/client";
import { Pool } from "pg";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { env } from "../../src/env.ts";
import { docsSchema } from "../../src/lib/docs.schema.ts";
import { reasoningSchema, type Reasoning } from "../../src/lib/reasoning.schema.ts";
import { signUp, startApp } from "./helpers.ts";

type Action = "getDocument" | "getDocumentReasoning";
type Locale = "en" | "fr";

function visibleMarkup(html: string): string {
	return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function visibleText(html: string): string {
	return visibleMarkup(html)
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#x27;|&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

async function functionIds(): Promise<Record<Action, string>> {
	const manifest = await readFile(".output/server/_ssr/ssr.mjs", "utf8");
	const id = (name: Action): string => {
		const match = manifest.match(new RegExp(`"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`));
		assert.ok(match, `Build the app with the ${name} server function before this test.`);
		return match[1];
	};
	return { getDocument: id("getDocument"), getDocumentReasoning: id("getDocumentReasoning") };
}

function checkContent(html: string, reasoning: Reasoning, messages: Record<string, string>): void {
	const text = visibleText(html);
	assert.equal(reasoning.sections.length, 7);
	for (const section of reasoning.sections) {
		let expected: string[];
		switch (section.id) {
			case "header":
				expected = [section.data.title];
				break;
			case "reading_map":
				expected = [messages.reasoning_map_title];
				break;
			case "most_read":
				expected = [messages.reasoning_most_read_title, ...section.data.items.map(item => item.title)];
				break;
			case "never_opened":
				expected = [
					messages.reasoning_never_opened_title.replace("{count}", String(section.data.count)),
					...section.data.items.map(item => item.title),
				];
				break;
			case "kpis":
				expected = [messages.reasoning_kpis_title];
				break;
			case "iterations":
				expected = [messages.reasoning_iterations_title, ...section.data.items.map(item => item.intention.headline)];
				break;
			case "iteration_bars":
				expected = [messages.reasoning_duration_title.replace("{count}", String(section.data.items.length))];
				break;
		}
		for (const value of expected) {
			assert.ok(value, `The ${section.id} section must have a localized label.`);
			assert.ok(text.includes(value.replace(/\s+/g, " ").trim()), `The ${section.id} section must show: ${value}`);
		}
	}
}

function checkMapBars(html: string, reasoning: Reasoning): void {
	const section = reasoning.sections.find(item => item.id === "reading_map");
	assert.ok(section);
	const map = visibleMarkup(html).match(/<ul\b[^>]*data-reasoning-map[^>]*>[\s\S]*?<\/ul>/);
	assert.ok(map, "The reading map must appear in the page.");
	const fills = [...map[0].matchAll(/<span\b[^>]*style="height:([\d.]+)%"[^>]*>/g)];
	assert.equal(fills.length, section.data.sections.length, "Each map section must contain a bar.");
	for (const [index, entry] of section.data.sections.entries()) {
		assert.equal(Number(fills[index][1]), Math.max(0, Math.min(1, entry.share_read)) * 100);
		if (entry.share_read > 0) assert.ok(Number(fills[index][1]) > 0);
	}
}

test("reasoning pages and reader tabs use local services", { timeout: 120_000 }, async (t) => {
	for (const url of [env.DATABASE_URL, env.S3_ENDPOINT]) {
		assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname), "Use local PostgreSQL and S3 endpoints.");
	}
	const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
	const s3 = new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
		maxAttempts: 1,
	});
	const prefix = `e2e-reasoning-${randomUUID()}`;
	const documents = {
		private: `${prefix}-private`, public: `${prefix}-public`,
		deleted: `${prefix}-deleted`, absent: `${prefix}-absent`, missing: `${prefix}-missing`,
	};
	const users: string[] = [];
	let seeded = false;
	t.after(async () => {
		try {
			if (seeded) await pool.query("DELETE FROM documents WHERE id = ANY($1::text[])", [Object.values(documents)]);
			await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
		} finally {
			s3.destroy();
			await pool.end();
		}
	});
	const column = await pool.query<{ column_name: string }>(
		"SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'documents' AND column_name = 'reasoning'",
	);
	assert.equal(column.rowCount, 1, "The reasoning column is missing. Ask the parent agent before you apply the migration.");
	await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
	const actions = await functionIds();
	const origin = await startApp(t);
	const owner = await signUp(origin);
	users.push(owner.id);
	const reader = await signUp(origin);
	users.push(reader.id);
	const dataSource: unknown = JSON.parse(await readFile("workers/fake-generation/fixtures/data.json", "utf8"));
	const data = docsSchema.parse(dataSource);
	const reasoningSource: unknown = JSON.parse(await readFile(new URL("../../../explorer/daley_thesis/reasoning.json", import.meta.url), "utf8"));
	const reasoning = reasoningSchema.parse(reasoningSource);
	const header = reasoning.sections.find(section => section.id === "header");
	assert.ok(header, "The reasoning fixture must contain a header.");
	// The fixture URL prevents S3 PDF lookups. This test does not start a worker.
	data.pdf_url = `${origin}/fixture.pdf`;
	await pool.query(
		`INSERT INTO documents (id, title, created_by, public, generation_completed, data, reasoning, deleted_at) VALUES
		 ($1, $5, $6, false, true, $7::jsonb, $8::jsonb, NULL),
		 ($2, $5, $6, true, true, $7::jsonb, $8::jsonb, NULL),
		 ($3, $5, $6, true, true, $7::jsonb, $8::jsonb, now()),
		 ($4, $5, $6, false, true, $7::jsonb, NULL, NULL)`,
		[documents.private, documents.public, documents.deleted, documents.absent, header.data.title, owner.id, JSON.stringify(data), JSON.stringify(reasoning)],
	);
	seeded = true;
	const request = (path: string, cookie = owner.cookie) => fetch(origin + path, {
		headers: { Cookie: cookie, Origin: origin }, redirect: "manual", signal: AbortSignal.timeout(20_000),
	});
	const call = async (name: Action, id: string, cookie = owner.cookie): Promise<unknown> => {
		const url = new URL(`/_serverFn/${actions[name]}`, origin);
		url.searchParams.set("payload", JSON.stringify(await toJSONAsync({ data: { id } })));
		const response = await fetch(url, {
			headers: { Cookie: cookie, Origin: origin, "x-tsr-serverFn": "true" },
			redirect: "manual", signal: AbortSignal.timeout(20_000),
		});
		assert.match(response.headers.get("content-type") ?? "", /application\/json/);
		const result: unknown = fromCrossJSON(await response.json(), { plugins: defaultSerovalDeserializerPlugins });
		if (result instanceof Error) throw result;
		assert.equal(response.status, 200);
		assert.ok(result && typeof result === "object");
		if ("error" in result && result.error !== undefined) throw result.error;
		assert.ok("result" in result);
		return result.result;
	};
	const locales: Locale[] = ["en", "fr"];
	const labels: Record<Locale, string> = { en: "Reasoning", fr: "Raisonnement" };

	await t.test("the owner reads private reasoning and another reader reads public reasoning", async () => {
		for (const [id, cookie] of [[documents.private, owner.cookie], [documents.public, reader.cookie]] as const) {
			assert.deepEqual(await call("getDocumentReasoning", id, cookie), reasoning);
			const detail = await call("getDocument", id, cookie);
			assert.ok(detail && typeof detail === "object" && "hasReasoning" in detail);
			assert.equal(detail.hasReasoning, true);
			for (const locale of locales) {
				const messages: Record<string, string> = JSON.parse(await readFile(`messages/${locale}.json`, "utf8"));
				const response = await request(`/${locale}/documents/${id}/reasoning`, cookie);
				assert.equal(response.status, 200);
				const html = await response.text();
				assert.ok(visibleText(html).includes(labels[locale]));
				checkContent(html, reasoning, messages);
				checkMapBars(html, reasoning);
				if (locale === "en") {
					for (const label of ["Carte de lecture", "Sections les plus lues", "Jamais ouvertes", "Chiffres clés", "Les 9 itérations"]) {
						assert.ok(!visibleText(html).includes(label), `The English interface must not show ${label}.`);
					}
				}
			}
		}
	});

	await t.test("private, deleted, and missing reasoning deny access", async () => {
		for (const [id, cookie] of [
			[documents.private, reader.cookie], [documents.deleted, owner.cookie],
			[documents.deleted, reader.cookie], [documents.missing, owner.cookie],
		] as const) {
			assert.equal(await call("getDocumentReasoning", id, cookie), null);
			assert.equal(await call("getDocument", id, cookie), null);
			for (const locale of locales) {
				const response = await request(`/${locale}/documents/${id}/reasoning`, cookie);
				assert.equal(response.status, 404);
				const text = visibleText(await response.text());
				assert.ok(!text.includes(header.data.title));
			}
		}
	});

	await t.test("signed-out readers redirect to login", async () => {
		for (const locale of locales) {
			for (const id of [documents.private, documents.public, documents.absent]) {
				const response = await request(`/${locale}/documents/${id}/reasoning`, "");
				assert.ok([302, 303, 307].includes(response.status));
				assert.match(response.headers.get("location") ?? "", /\/login/);
				await response.text();
			}
		}
	});

	await t.test("a document without reasoning shows an empty state", async () => {
		assert.equal(await call("getDocumentReasoning", documents.absent), null);
		const detail = await call("getDocument", documents.absent);
		assert.ok(detail && typeof detail === "object" && "hasReasoning" in detail);
		assert.equal(detail.hasReasoning, false);
		for (const locale of locales) {
			const messages: Record<string, string> = JSON.parse(await readFile(`messages/${locale}.json`, "utf8"));
			const response = await request(`/${locale}/documents/${documents.absent}/reasoning`);
			assert.equal(response.status, 200);
			const text = visibleText(await response.text());
			assert.ok(text.includes(messages.reasoning_empty));
			assert.ok(!text.includes("70 / 147"));
		}
	});

	await t.test("fiche and note readers enable the localized reasoning tab only when reasoning exists", async () => {
		for (const locale of locales) {
			for (const suffix of ["fiche", "note"]) {
				for (const id of [documents.private, documents.absent]) {
					const response = await request(`/${locale}/documents/${id}/${suffix}`);
					assert.equal(response.status, 200);
					const html = visibleMarkup(await response.text());
					const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/g)?.find(markup => visibleText(markup).includes(labels[locale]));
					assert.ok(nav, `The ${locale} ${suffix} reader must show a reasoning tab.`);
					const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
					const link = links.find(match => visibleText(match[2]).includes(labels[locale]));
					if (id === documents.private) {
						assert.ok(link, "The reasoning tab must be a link.");
						assert.ok(link[1].includes(`href="/${locale}/documents/${id}/reasoning"`));
						assert.ok(!link[1].includes('aria-disabled="true"'));
					} else {
						assert.equal(link, undefined, "An unavailable reasoning tab must not be a link.");
						const disabled = [...nav.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)]
							.find(match => visibleText(match[2]).includes(labels[locale]));
						assert.ok(disabled);
						assert.ok(disabled[1].includes('aria-disabled="true"'));
					}
				}
			}
		}
	});
});
