import { createFileRoute } from "@tanstack/react-router";
import { NoteContent } from "#/components/note-content";
import { Route as DocumentRoute } from "../../$documentId";

export const Route = createFileRoute(
	"/_protected/documents/$documentId/_reader/note",
)({
	component: NotePage,
});

function NotePage() {
	const document = DocumentRoute.useLoaderData();
	return (
		<NoteContent
			title={document.title}
			markdown={document.noteMarkdown}
			pdfUrl={document.pdfUrl}
		/>
	);
}
