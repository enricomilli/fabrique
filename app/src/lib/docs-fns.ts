import { createServerFn } from "@tanstack/react-start";
import type { DocumentSummary } from "./docs.server";

export type { DocumentSummary } from "./docs.server";

export const getDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<DocumentSummary[]> => {
		const { loadDocuments } = await import("./docs.server");
		return loadDocuments();
	},
);
