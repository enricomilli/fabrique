import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import {
	type Docs,
	docsSchema,
	type FicheMetadata,
	parseFicheStructure,
} from "./docs.schema.ts";

export interface DocumentSummary {
	id: string;
	title: string;
	metadata: FicheMetadata | null;
	thesis: string;
	generated: string;
	hasFiche: boolean;
	hasNote: boolean;
	preview: string;
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

function summarize(id: string, document: Docs): DocumentSummary {
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
		title: cleanMarkdown(metadata?.titre ?? "") || getTitle(markdown, thesis),
		metadata,
		thesis,
		generated: document.generated,
		hasFiche: ficheMarkdown.length > 0,
		hasNote: document.note.note_md.trim().length > 0,
		preview: getPreview(getCentralThesis(ficheMarkdown) ?? markdown),
	};
}

export async function loadDocuments(
	directory: string = getExplorerDirectory(),
): Promise<DocumentSummary[]> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => {
			throw new Error(
				"Cannot read the document directory. Check EXPLORER_DIR and directory permissions.",
			);
		},
	);
	const summaries: DocumentSummary[] = [];
	const folders = entries.filter((entry) => entry.isDirectory());
	folders.sort((left, right) => left.name.localeCompare(right.name, "en"));
	for (const folder of folders) {
		const file = join(directory, folder.name, "data.json");
		let contents: string;
		try {
			contents = await readFile(file, "utf8");
		} catch (error: unknown) {
			// Directories without data.json do not match explorer/*/data.json.
			if (error instanceof Error && "code" in error && error.code === "ENOENT")
				continue;
			throw new Error(`Cannot read document file: ${file}`);
		}
		let input: unknown;
		try {
			input = JSON.parse(contents);
		} catch {
			throw new Error(`Invalid JSON in document file: ${file}`);
		}
		const parsed = docsSchema.safeParse(input);
		if (!parsed.success) {
			// Do not expose document values or Zod messages in errors.
			const paths = parsed.error.issues
				.slice(0, 5)
				.map((issue) => issue.path.join("."));
			throw new Error(
				`Invalid document schema: ${file}. ${parsed.error.issues.length} issue(s). First paths: ${paths.join(", ")}`,
			);
		}
		summaries.push(summarize(folder.name, parsed.data));
	}
	return summaries;
}
