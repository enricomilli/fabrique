import { createFileRoute } from "@tanstack/react-router";
import { FicheContent } from "#/components/fiche-content";
import { Route as DocumentRoute } from "../../$documentId";

export const Route = createFileRoute(
	"/_protected/documents/$documentId/_reader/fiche",
)({
	component: FichePage,
});

function FichePage() {
	const document = DocumentRoute.useLoaderData();
	return (
		<FicheContent
			key={document.id}
			markdown={document.ficheMarkdown}
			pdfUrl={document.pdfUrl}
		/>
	);
}
