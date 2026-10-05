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
	const available = ficheMatch ? document.hasFiche : document.hasNote;
	if (!document.generationCompleted && !available) {
		return <PendingDocument document={document} />;
	}
	return (
		<div className="min-h-screen">
			<AppHeader
				documentTitle={ficheMatch ? document.title : undefined}
				showFeedback={!ficheMatch}
			/>
			<main
				className={`mx-auto w-full px-6 pt-0 pb-[calc(7rem+env(safe-area-inset-bottom))] ${ficheMatch ? "lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,53rem)_minmax(14rem,1fr)] lg:gap-x-8" : "note-reader-main max-w-4xl"}`}
			>
				{ficheMatch && <h1 className="sr-only">{document.title}</h1>}
				<Outlet />
			</main>
			<ReaderFormatSwitcher
				documentId={document.id}
				hasFiche={document.hasFiche}
				hasNote={document.hasNote}
			/>
		</div>
	);
}
