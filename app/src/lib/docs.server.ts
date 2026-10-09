import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { and, eq, isNull, or } from "drizzle-orm";
import { documents } from "../db/schema/documents.ts";
import {
	type Docs,
	docsSchema,
	type FicheMetadata,
	parseFicheStructure,
} from "./docs.schema.ts";
import { logDocumentError, logDocumentEvent } from "./document-log.ts";
import { type Reasoning, reasoningSchema } from "./reasoning.schema.ts";

type DocumentRecord = typeof documents.$inferSelect;

export const publicDocumentsFilter = and(
	eq(documents.public, true),
	eq(documents.generationCompleted, true),
	isNull(documents.deletedAt),
);

async function lookupPdf(id: string): Promise<{ size: number } | null> {
	try {
		const { findStoredPdf } = await import("./s3-pdf.server.ts");
		return await findStoredPdf(id);
	} catch (error: unknown) {
		logDocumentError("document.pdf.lookup.failed", error, { documentId: id });
		throw new Error("Cannot read the document PDF.");
	}
}

function validateDocument(data: unknown): Docs {
	const parsed = docsSchema.safeParse(data);
	if (!parsed.success) throw new Error("Invalid document schema.");
	return parsed.data;
}

export interface DocumentSummary {
	id: string;
	public: boolean;
	title: string;
	generationCompleted: boolean;
	metadata: FicheMetadata | null;
	thesis: string;
	generated: string;
	hasFiche: boolean;
	hasNote: boolean;
	preview: string;
}

export interface DocumentDetail extends DocumentSummary {
	ficheMarkdown: string;
	noteMarkdown: string;
	pdfUrl: string | null;
	generationData: Docs | null;
	generationReasoning?: Reasoning | null;
	hasReasoning: boolean;
}
// Start the server from app, or set EXPLORER_DIR to an absolute directory path.
export function getExplorerDirectory(): string {
	const configured = process.env.EXPLORER_DIR?.trim();
	if (!configured) return resolve(process.cwd(), "../explorer");
	if (!isAbsolute(configured)) {
		throw new Error("EXPLORER_DIR must be an absolute directory path.");
	}
	return configured;
}

function getTitle(markdown: string, fallback: string): string {
	let fence: string | undefined;
	for (const line of markdown.split(/\r?\n/)) {
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) {
			if (
				marker?.[0] === fence[0] &&
				marker.length >= fence.length &&
				line.trim() === marker
			)
				fence = undefined;
			continue;
		}
		if (marker) {
			fence = marker;
			continue;
		}
		const heading = /^ {0,3}#{1,6}[\t ]+(.+)$/.exec(line)?.[1];
		const title = heading?.replace(/[\t ]+#+[\t ]*$/, "").trim();
		if (title) return title;
	}
	return fallback;
}

function cleanMarkdown(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]*>/g, "")
		.replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/\b_([^_]+)_\b/g, "$1")
		.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|>\s*)/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}

function getPreview(markdown: string): string {
	const text = cleanMarkdown(
		markdown
			.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, "")
			.replace(/^ {0,3}#{1,6}[\t ]+.*$/gm, ""),
	);
	if (text.length <= 600) return text;
	return `${text.slice(0, 599).replace(/\s+\S*$/, "")}…`;
}

function getCentralThesis(markdown: string): string | null {
	const lines = markdown.split(/\r?\n/);
	let start: number | undefined;
	let fence: string | undefined;
	for (const [index, line] of lines.entries()) {
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) {
			if (
				marker?.[0] === fence[0] &&
				marker.length >= fence.length &&
				line.trim() === marker
			)
				fence = undefined;
			continue;
		}
		if (marker) {
			fence = marker;
			continue;
		}
		const heading = /^ {0,3}(#{1,6})[\t ]+(.+)$/.exec(line);
		if (!heading) continue;
		if (start !== undefined && heading[1].length <= 2)
			return lines.slice(start, index).join("\n");
		const title = heading[2].replace(/[\t ]+#+[\t ]*$/, "").trim();
		if (heading[1] === "##" && cleanMarkdown(title) === "Thèse centrale")
			start = index + 1;
	}
	return start === undefined ? null : lines.slice(start).join("\n");
}

function summarize(
	id: string,
	document: Docs,
	isPublic: boolean,
): DocumentSummary {
	const thesis = document.fiche.thesis.trim() || document.note.thesis.trim();
	const ficheMarkdown = document.fiche.fiche_md.trim();
	const markdown = ficheMarkdown || document.note.note_md.trim();
	let metadata: FicheMetadata | null = null;
	if (document.fiche.structure_json.trim()) {
		try {
			metadata = parseFicheStructure(document.fiche.structure_json).metadata;
		} catch {
			throw new Error(
				"Invalid fiche.structure_json: expected valid JSON with the fiche structure schema.",
			);
		}
	}
	return {
		id,
		public: isPublic,
		title: cleanMarkdown(metadata?.titre ?? "") || getTitle(markdown, thesis),
		generationCompleted: true,
		metadata,
		thesis,
		generated: document.generated,
		hasFiche: ficheMarkdown.length > 0,
		hasNote: document.note.note_md.trim().length > 0,
		preview: getPreview(getCentralThesis(ficheMarkdown) ?? markdown),
	};
}

function summarizeRecord(record: DocumentRecord): DocumentSummary {
	if (record.generationCompleted) {
		return summarize(record.id, validateDocument(record.data), record.public);
	}
	return {
		id: record.id,
		public: record.public,
		title: record.title ?? record.id,
		generationCompleted: false,
		metadata: null,
		thesis: "",
		generated: "",
		hasFiche: false,
		hasNote: false,
		preview: "",
	};
}

export async function loadDocuments(): Promise<DocumentSummary[]> {
	const started = performance.now();
	logDocumentEvent("document.list.started", { scope: "public" });
	let records: DocumentRecord[];
	try {
		const { db } = await import("../db/drizzle.ts");
		records = await db.select().from(documents).where(publicDocumentsFilter);
	} catch (error: unknown) {
		logDocumentError("document.list.failed", error, {
			scope: "public",
			durationMs: Math.round(performance.now() - started),
		});
		throw new Error("Cannot read documents.");
	}
	logDocumentEvent("document.list.completed", {
		scope: "public",
		count: records.length,
		durationMs: Math.round(performance.now() - started),
	});
	return records
		.sort((left, right) => left.id.localeCompare(right.id, "en"))
		.map(summarizeRecord);
}

export async function loadMyDocuments(
	userId: string,
): Promise<DocumentSummary[]> {
	const started = performance.now();
	logDocumentEvent("document.list.started", { scope: "owned" });
	let records: DocumentRecord[];
	try {
		const { db } = await import("../db/drizzle.ts");
		records = await db
			.select()
			.from(documents)
			.where(and(eq(documents.createdBy, userId), isNull(documents.deletedAt)));
	} catch (error: unknown) {
		logDocumentError("document.list.failed", error, {
			scope: "owned",
			durationMs: Math.round(performance.now() - started),
		});
		throw new Error("Cannot read documents.");
	}
	logDocumentEvent("document.list.completed", {
		scope: "owned",
		count: records.length,
		durationMs: Math.round(performance.now() - started),
	});
	return records
		.sort((left, right) => left.id.localeCompare(right.id, "en"))
		.map(summarizeRecord);
}

export async function loadDocument(
	id: string,
	userId?: string,
): Promise<DocumentDetail | null> {
	if (
		!id ||
		id === "." ||
		id === ".." ||
		/[/\\%]/.test(id) ||
		Array.from(id).some((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127;
		})
	) {
		logDocumentEvent("document.read.rejected", { reason: "invalid_id" });
		return null;
	}
	const started = performance.now();
	logDocumentEvent("document.read.started", { documentId: id });
	let phase = "database";
	try {
		const { db } = await import("../db/drizzle.ts");
		const [record] = await db
			.select()
			.from(documents)
			.where(
				and(
					eq(documents.id, id),
					isNull(documents.deletedAt),
					or(
						eq(documents.public, true),
						userId === undefined ? undefined : eq(documents.createdBy, userId),
					),
				),
			)
			.limit(1);
		if (!record) {
			logDocumentEvent("document.read.unavailable", {
				documentId: id,
				durationMs: Math.round(performance.now() - started),
			});
			return null;
		}
		logDocumentEvent("document.read.database.completed", {
			documentId: id,
			generationCompleted: record.generationCompleted,
		});
		phase = "validation";
		const data =
			record.data === null && !record.generationCompleted
				? null
				: validateDocument(record.data);
		phase = "pdf";
		let pdfUrl = record.generationCompleted ? (data?.pdf_url ?? null) : null;
		if (!pdfUrl) {
			const pdf = await lookupPdf(id);
			if (pdf) pdfUrl = `/api/pdfs/${encodeURIComponent(id)}`;
		}
		phase = "summary";
		const result: DocumentDetail = {
			...summarizeRecord(record),
			hasFiche: Boolean(data?.fiche.fiche_md.trim()),
			hasNote: Boolean(data?.note.note_md.trim()),
			ficheMarkdown: data?.fiche.fiche_md ?? "",
			noteMarkdown: data?.note.note_md ?? "",
			pdfUrl,
			generationData: record.generationCompleted ? null : data,
			generationReasoning:
				!record.generationCompleted && record.reasoning !== null
					? reasoningSchema.parse(record.reasoning)
					: null,
			hasReasoning: record.reasoning !== null,
		};
		logDocumentEvent("document.read.completed", {
			documentId: id,
			generationCompleted: record.generationCompleted,
			hasPdf: pdfUrl !== null,
			hasFiche: result.hasFiche,
			hasNote: result.hasNote,
			ficheSteps: data?.fiche.steps.length ?? 0,
			noteIterations: data?.note.iterations.length ?? 0,
			durationMs: Math.round(performance.now() - started),
		});
		return result;
	} catch (error: unknown) {
		logDocumentError("document.read.failed", error, {
			documentId: id,
			phase,
			durationMs: Math.round(performance.now() - started),
		});
		if (phase === "database") throw new Error("Cannot read the document.");
		throw error;
	}
}

export async function setDocumentVisibility(
	id: string,
	userId: string,
	isPublic: boolean,
): Promise<void> {
	const { db } = await import("../db/drizzle.ts");
	const updated = await db
		.update(documents)
		.set({ public: isPublic })
		.where(
			and(
				eq(documents.id, id),
				eq(documents.createdBy, userId),
				isNull(documents.deletedAt),
			),
		)
		.returning({ id: documents.id });
	if (updated.length === 0) throw new Error("Cannot change this document.");
}

export async function softDeleteDocument(
	id: string,
	userId: string,
): Promise<void> {
	const { db } = await import("../db/drizzle.ts");
	const updated = await db
		.update(documents)
		.set({ deletedAt: new Date(), public: false })
		.where(
			and(
				eq(documents.id, id),
				eq(documents.createdBy, userId),
				isNull(documents.deletedAt),
			),
		)
		.returning({ id: documents.id });
	if (updated.length === 0) throw new Error("Cannot delete this document.");
}

export async function loadDocumentReasoning(
	id: string,
	userId: string,
): Promise<Reasoning | null> {
	const { db } = await import("../db/drizzle.ts");
	const [record] = await db
		.select({ reasoning: documents.reasoning })
		.from(documents)
		.where(
			and(
				eq(documents.id, id),
				isNull(documents.deletedAt),
				or(eq(documents.public, true), eq(documents.createdBy, userId)),
			),
		)
		.limit(1);
	if (!record || record.reasoning === null) return null;
	const parsed = reasoningSchema.safeParse(record.reasoning);
	if (!parsed.success) throw new Error("Invalid reasoning schema.");
	return parsed.data;
}
