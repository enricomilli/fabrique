import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/pdfs/$documentId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const { servePdf } = await import("../../../lib/pdf.server");
				return servePdf(request, params.documentId);
			},
			HEAD: async ({ request, params }) => {
				const { servePdf } = await import("../../../lib/pdf.server");
				return servePdf(request, params.documentId);
			},
		},
	},
});
