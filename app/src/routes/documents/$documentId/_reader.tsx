import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AppHeader } from "#/components/app-header";
import { ReaderFormatSwitcher } from "#/components/reader-format-switcher";
import { m } from "#/paraglide/messages";
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
			<main className="mx-auto w-full max-w-4xl px-6 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))]">
				<h1
					className={
						ficheMatch
							? "sr-only"
							: "mt-10 text-balance text-center wrap-break-words font-heading text-xl leading-relaxed sm:text-2xl"
					}
				>
					{document.title}
				</h1>
				<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
					{m.document_generated()}
				</p>
				<Outlet />
				{document.pdfUrl && (
					<div className="mt-8 text-center">
						<a
							href={document.pdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
						>
							{m.document_read_pdf()} <span aria-hidden="true">→</span>
						</a>
					</div>
				)}
			</main>
			<ReaderFormatSwitcher
				documentId={document.id}
				hasFiche={document.hasFiche}
				hasNote={document.hasNote}
			/>
		</div>
	);
}
