import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { uploadDocument } = await import(
					"../../lib/document-upload.server"
				);
				return uploadDocument(request);
			},
		},
	},
});
