import { createFileRoute } from "@tanstack/react-router";
import { DocumentContent } from "#/components/document-content";
import { Route as DocumentRoute } from "../../$documentId";

export const Route = createFileRoute("/documents/$documentId/_reader/note")({
	component: NotePage,
});

function NotePage() {
	const document = DocumentRoute.useLoaderData();
	return <DocumentContent markdown={document.noteMarkdown} />;
}
