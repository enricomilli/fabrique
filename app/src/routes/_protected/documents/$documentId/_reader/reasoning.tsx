import { createFileRoute } from "@tanstack/react-router";
import { ReasoningContent } from "#/components/reasoning-content";
import { getDocumentReasoning } from "#/lib/docs-fns";
import { Route as DocumentRoute } from "../../$documentId";

export const Route = createFileRoute(
	"/_protected/documents/$documentId/_reader/reasoning",
)({
	loader: ({ params }) =>
		getDocumentReasoning({ data: { id: params.documentId } }),
	component: ReasoningPage,
});

function ReasoningPage() {
	const document = DocumentRoute.useLoaderData();
	const reasoning = Route.useLoaderData();
	return (
		<ReasoningContent
			reasoning={reasoning}
			title={document.title}
			pdfUrl={document.pdfUrl}
		/>
	);
}
