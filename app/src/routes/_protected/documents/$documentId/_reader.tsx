import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AppHeader } from "#/components/app-header";
import { PendingDocument } from "#/components/pending-document";
import { ReaderFormatSwitcher } from "#/components/reader-format-switcher";
import { Route as DocumentRoute } from "../$documentId";

export const Route = createFileRoute(
	"/_protected/documents/$documentId/_reader",
)({
	component: DocumentReaderLayout,
});

function DocumentReaderLayout() {
	const document = DocumentRoute.useLoaderData();
	const ficheMatch = useMatch({
		from: "/_protected/documents/$documentId/_reader/fiche",
		shouldThrow: false,
	});
	const reasoningMatch = useMatch({
		from: "/_protected/documents/$documentId/_reader/reasoning",
		shouldThrow: false,
	});
	let available = document.hasNote;
	let layoutClassName = "note-reader-main max-w-4xl";
	if (ficheMatch) {
		available = document.hasFiche;
		layoutClassName =
			"lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,53rem)_minmax(14rem,1fr)] lg:gap-x-8";
	} else if (reasoningMatch) {
		available = document.hasReasoning;
		layoutClassName = "max-w-[1180px]";
	}
	if (!document.generationCompleted && !available) {
		return <PendingDocument document={document} />;
	}
	return (
		<div className="min-h-screen">
			<AppHeader
				documentTitle={
					ficheMatch || reasoningMatch ? document.title : undefined
				}
				showFeedback={!ficheMatch && !reasoningMatch}
			/>
			<main
				className={`mx-auto w-full px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] ${reasoningMatch ? "pt-7" : "pt-0"} ${layoutClassName}`}
			>
				{ficheMatch && <h1 className="sr-only">{document.title}</h1>}
				<Outlet />
			</main>
			<ReaderFormatSwitcher
				documentId={document.id}
				hasFiche={document.hasFiche}
				hasNote={document.hasNote}
				hasReasoning={document.hasReasoning}
			/>
		</div>
	);
}
