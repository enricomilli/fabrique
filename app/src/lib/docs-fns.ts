import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DocumentDetail, DocumentSummary } from "./docs.server";

export type { DocumentDetail, DocumentSummary } from "./docs.server";

export const getDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<DocumentSummary[]> => {
		const { ensureSession } = await import("./fns/session-fns");
		await ensureSession();
		const { loadDocuments } = await import("./docs.server");
		return loadDocuments();
	},
);

export const getMyDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<DocumentSummary[]> => {
		const { ensureSession } = await import("./fns/session-fns");
		const session = await ensureSession();
		const { loadMyDocuments } = await import("./docs.server");
		return loadMyDocuments(session.user.id);
	},
);

export const getDocument = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }): Promise<DocumentDetail | null> => {
		const { ensureSession } = await import("./fns/session-fns");
		const session = await ensureSession();
		const { loadDocument } = await import("./docs.server");
		return loadDocument(data.id, session.user.id);
	});
