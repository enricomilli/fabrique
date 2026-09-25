import type { DocumentSummary } from "./docs-fns";

export type DocumentStatus = "both" | "fiche" | "note" | "source";
export type DocumentFilter = "all" | DocumentStatus;
export type DocumentSort = "recent" | "title";

export function documentStatus(document: DocumentSummary): DocumentStatus {
	if (document.hasFiche && document.hasNote) return "both";
	if (document.hasFiche) return "fiche";
	if (document.hasNote) return "note";
	return "source";
}

function normalize(value: string): string {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function filterDocuments(
	documents: DocumentSummary[],
	query: string,
	filter: DocumentFilter,
	sort: DocumentSort = "recent",
	locale = "en",
	discipline = "",
): DocumentSummary[] {
	const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
	return documents
		.filter((document) => {
			const metadata = document.metadata;
			const text = normalize(
				[
					document.title,
					document.thesis,
					metadata?.auteur,
					metadata?.etablissement,
					metadata?.annee,
					metadata?.discipline,
					...(metadata?.mots_cles ?? []),
				]
					.filter(Boolean)
					.join(" "),
			);
			return (
				(filter === "all" || documentStatus(document) === filter) &&
				(!discipline || metadata?.discipline?.trim() === discipline) &&
				terms.every((term) => text.includes(term))
			);
		})
		.sort((left, right) => {
			if (sort === "title")
				return left.title.localeCompare(right.title, locale);
			const leftDate = Date.parse(left.generated) || 0;
			const rightDate = Date.parse(right.generated) || 0;
			return rightDate - leftDate || left.id.localeCompare(right.id, locale);
		});
}
