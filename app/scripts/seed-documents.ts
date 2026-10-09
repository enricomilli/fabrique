import { createReadStream } from "node:fs";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { documents } from "../src/db/schema/documents.ts";
import { type Docs, docsSchema, parseFicheStructure } from "../src/lib/docs.schema.ts";
import { getExplorerDirectory } from "../src/lib/docs.server.ts";
import { logDocumentEvent, logDocumentError } from "../src/lib/document-log.ts";
import { findPdf, getPdfDirectory } from "../src/lib/pdf.server.ts";
import { type Reasoning, reasoningSchema } from "../src/lib/reasoning.schema.ts";

const pathsSchema = z.object({
	explorerDir: z.string().trim().min(1).transform((value) => resolve(value)),
	pdfDir: z.string().trim().min(1).transform((value) => resolve(value)),
});

const storageSchema = z.object({
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
	S3_REGION: z.string().trim().min(1),
	S3_ACCESS_KEY_ID: z.string().trim().min(1),
	S3_SECRET_ACCESS_KEY: z.string().trim().min(1),
	S3_BUCKET: z.string().trim().min(1),
	S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const documentIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
	.refine((value) => !/[\r\n]/.test(value));

// This checks the PDF signature, not the complete PDF structure.
const pdfSchema = z.object({
	path: z.string().min(1),
	size: z.number().int().positive(),
	header: z.string().regex(/^%PDF-\d\.\d/),
});

type SeedPaths = z.infer<typeof pathsSchema>;
type SeedPdf = Pick<z.infer<typeof pdfSchema>, "path" | "size">;
export type SeedDocument = {
	id: string;
	data: Docs;
	reasoning: Reasoning | null;
	pdf: SeedPdf | null;
};
export type SeedWriter = {
	uploadPdf: (key: string, pdf: SeedPdf) => Promise<void>;
	upsertDocument: (document: SeedDocument) => Promise<void>;
};

export function getSeedPaths(options: Partial<SeedPaths> = {}): SeedPaths {
	return pathsSchema.parse({
		explorerDir: options.explorerDir ?? getExplorerDirectory(),
		pdfDir: options.pdfDir ?? getPdfDirectory(),
	});
}

async function readSeedPdf(id: string, directory: string): Promise<SeedPdf | null> {
	const pdf = await findPdf(id, directory);
	if (!pdf) {
		// A missing PDF is optional. An existing unsafe path must not be skipped.
		try {
			await stat(join(directory, `${id}.pdf`));
		} catch (error: unknown) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
			throw error;
		}
		throw new Error(`Invalid PDF path for document ${id}.`);
	}
	const file = await open(pdf.path, "r");
	try {
		const header = Buffer.alloc(8);
		await file.read(header, 0, header.length, 0);
		if (!pdfSchema.safeParse({ ...pdf, header: header.toString("ascii") }).success) {
			throw new Error(`Invalid PDF signature or empty file: ${pdf.path}`);
		}
		return pdf;
	} finally {
		await file.close();
	}
}

async function readSeedReasoning(id: string, root: string): Promise<Reasoning | null> {
	let file: string;
	try {
		file = await realpath(join(root, id, "reasoning.json"));
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
	const local = relative(root, file);
	if (isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`)) {
		throw new Error(`Reasoning path is outside the source directory: ${id}`);
	}
	const text = await readFile(file, "utf8");
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch {
		throw new Error(`Invalid reasoning JSON: ${file}`);
	}
	const parsed = reasoningSchema.safeParse(input);
	if (!parsed.success) {
		const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
		throw new Error(`Invalid reasoning schema: ${file}. Fields: ${fields}`);
	}
	return parsed.data;
}

export async function readSeedDocuments(paths: SeedPaths): Promise<SeedDocument[]> {
	const { explorerDir, pdfDir } = pathsSchema.parse(paths);
	for (const directory of [explorerDir, pdfDir]) {
		if (!(await stat(directory)).isDirectory()) {
			throw new Error(`Expected a directory: ${directory}`);
		}
	}
	const root = await realpath(explorerDir);
	const folders = (await readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.sort((left, right) => left.name.localeCompare(right.name, "en"));
	const result: SeedDocument[] = [];
	for (const folder of folders) {
		let file: string;
		try {
			file = await realpath(join(root, folder.name, "data.json"));
		} catch (error: unknown) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
			throw error;
		}
		const local = relative(root, file);
		if (isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`)) {
			throw new Error(`Document path is outside the source directory: ${folder.name}`);
		}
		const id = documentIdSchema.parse(folder.name);
		const text = await readFile(file, "utf8");
		let input: unknown;
		try {
			input = JSON.parse(text);
		} catch {
			throw new Error(`Invalid document JSON: ${file}`);
		}
		const parsed = docsSchema.safeParse(input);
		if (!parsed.success) {
			const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
			throw new Error(`Invalid document schema: ${file}. Fields: ${fields}`);
		}
		if (parsed.data.fiche.structure_json.trim()) {
			try {
				parseFicheStructure(parsed.data.fiche.structure_json);
			} catch {
				throw new Error(`Invalid fiche.structure_json: ${file}`);
			}
		}
		result.push({
			id,
			data: parsed.data,
			reasoning: await readSeedReasoning(id, root),
			pdf: await readSeedPdf(id, pdfDir),
		});
	}
	if (result.length === 0) throw new Error(`No documents found in ${explorerDir}.`);
	return result;
}

export async function writeSeedDocuments(records: SeedDocument[], writer: SeedWriter): Promise<void> {
	for (const document of records) {
		let operation = "pdf.upload";
		let started = Date.now();
		try {
			if (document.pdf) {
				logDocumentEvent("seed.pdf.upload.start", { documentId: document.id, sizeBytes: document.pdf.size });
				await writer.uploadPdf(`pdfs/${document.id}.pdf`, document.pdf);
				logDocumentEvent("seed.pdf.upload.complete", { documentId: document.id, durationMs: Date.now() - started });
			}
			operation = "document.upsert";
			started = Date.now();
			logDocumentEvent("seed.document.upsert.start", { documentId: document.id });
			await writer.upsertDocument(document);
			logDocumentEvent("seed.document.upsert.complete", { documentId: document.id, durationMs: Date.now() - started });
		} catch (error: unknown) {
			logDocumentError("seed.document.failed", error, {
				documentId: document.id, operation, durationMs: Date.now() - started,
			});
			throw error;
		}
	}
}

const seedStarted = Date.now();
let seedOperation = "input.validate";

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			"explorer-dir": { type: "string" },
			"pdf-dir": { type: "string" },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
	});
	if (values.help) {
		console.log("Usage: npm run db:seed -- [--explorer-dir PATH] [--pdf-dir PATH] [--dry-run]");
		return;
	}
	logDocumentEvent("seed.start", { dryRun: values["dry-run"] });
	const paths = getSeedPaths({ explorerDir: values["explorer-dir"], pdfDir: values["pdf-dir"] });
	// Validate all source files before the first upload or database write.
	logDocumentEvent("seed.input.start");
	const inputStarted = Date.now();
	const records = await readSeedDocuments(paths);
	const pdfCount = records.filter((record) => record.pdf !== null).length;
	const reasoningCount = records.filter((record) => record.reasoning !== null).length;
	logDocumentEvent("seed.input.complete", {
		documentCount: records.length, pdfCount, reasoningCount, durationMs: Date.now() - inputStarted,
	});
	for (const record of records) {
		if (!record.pdf) logDocumentEvent("seed.pdf.missing", { documentId: record.id });
	}
	if (values["dry-run"]) return;

	seedOperation = "config.validate";
	const config = storageSchema.parse(process.env);
	logDocumentEvent("seed.storage.configured", {
		databaseHost: new URL(config.DATABASE_URL).hostname,
		storageHost: new URL(config.S3_ENDPOINT).hostname,
	});
	const pool = new Pool({ connectionString: config.DATABASE_URL });
	const db = drizzle({ client: pool });
	const s3 = new S3Client({
		endpoint: config.S3_ENDPOINT,
		region: config.S3_REGION,
		forcePathStyle: config.S3_FORCE_PATH_STYLE,
		credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
	});
	try {
		seedOperation = "storage.bucket_check";
		const bucketStarted = Date.now();
		logDocumentEvent("seed.storage.bucket_check.start");
		await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
		logDocumentEvent("seed.storage.bucket_check.complete", { durationMs: Date.now() - bucketStarted });
		seedOperation = "db.check";
		const databaseStarted = Date.now();
		logDocumentEvent("seed.db.check.start");
		await db.select({ id: documents.id }).from(documents).limit(1);
		logDocumentEvent("seed.db.check.complete", { durationMs: Date.now() - databaseStarted });
		seedOperation = "documents.write";
		await writeSeedDocuments(records, {
			async uploadPdf(key, pdf) {
				const body = createReadStream(pdf.path);
				try {
					await s3.send(new PutObjectCommand({
						Bucket: config.S3_BUCKET,
						Key: key,
						Body: body,
						ContentLength: pdf.size,
						ContentType: "application/pdf",
					}));
				} finally {
					body.destroy();
				}
			},
			async upsertDocument(document) {
				const generationCompleted = Boolean(
					document.data.fiche.fiche_md.trim() && document.data.note.note_md.trim(),
				);
				await db.insert(documents).values({
					id: document.id, data: document.data, reasoning: document.reasoning,
					public: true, createdBy: null, generationCompleted,
				}).onConflictDoUpdate({
					target: documents.id,
					// Preserve ownership, visibility, and deletion on repeat runs.
					// Preserve saved reasoning if the source file is missing.
					set: {
						data: document.data,
						generationCompleted,
						...(document.reasoning === null ? {} : { reasoning: document.reasoning }),
					},
				});
			},
		});
	} finally {
		s3.destroy();
		await pool.end();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().then(() => {
		logDocumentEvent("seed.complete", { durationMs: Date.now() - seedStarted });
	}).catch((error: unknown) => {
		logDocumentError("seed.main.failed", seedOperation === "input.validate" ? new Error("The seed input is invalid.") : error, {
			operation: seedOperation, durationMs: Date.now() - seedStarted,
			errorType: error instanceof Error ? error.name : "UnknownError",
		});
		process.exitCode = 1;
	});
}
