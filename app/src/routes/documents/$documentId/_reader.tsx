import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AppHeader } from "#/components/app-header";
import { ReaderFormatSwitcher } from "#/components/reader-format-switcher";
import { Route as DocumentRoute } from "../$documentId";

export const Route = createFileRoute("/documents/$documentId/_reader")({
	component: DocumentReaderLayout,
});

function DocumentReaderLayout() {
	const document = DocumentRoute.useLoaderData();
	const ficheMatch = useMatch({
		from: "/documents/$documentId/_reader/fiche",
		shouldThrow: false,
	});
	return (
		<div className="min-h-screen">
			<AppHeader
				documentTitle={ficheMatch ? document.title : undefined}
				showFeedback={!ficheMatch}
			/>
			<main
				className={`mx-auto w-full px-6 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))] ${ficheMatch ? "lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,53rem)_minmax(14rem,1fr)] lg:gap-x-8" : "max-w-4xl"}`}
			>
				<h1
					className={
						ficheMatch
							? "sr-only"
							: "mt-10 text-balance text-center wrap-break-words font-heading text-xl leading-relaxed sm:text-2xl"
					}
				>
					{document.title}
				</h1>
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
