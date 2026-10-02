import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/pdfs/$documentId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const { serveStoredPdf } = await import("../../../lib/s3-pdf.server");
				return serveStoredPdf(request, params.documentId);
			},
			HEAD: async ({ request, params }) => {
				const { serveStoredPdf } = await import("../../../lib/s3-pdf.server");
				return serveStoredPdf(request, params.documentId);
			},
		},
	},
});
