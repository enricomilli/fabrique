import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	BookOpenIcon,
	ListIcon,
} from "lucide-react";
import { AppHeader } from "#/components/app-header";
import { m } from "#/paraglide/messages";
import { Route as DocumentRoute } from "../$documentId";

export const Route = createFileRoute("/documents/$documentId/")({
	component: DocumentSelectionPage,
});

function DocumentSelectionPage() {
	const document = DocumentRoute.useLoaderData();
	const details = [
		document.metadata?.auteur,
		document.metadata?.annee,
		document.metadata?.etablissement,
	]
		.filter(Boolean)
		.join(" · ");
	const formats = [
		{
			to: "/documents/$documentId/fiche" as const,
			title: m.document_fiche(),
			description: m.document_fiche_description(),
			action: m.document_read_fiche(),
			available: document.hasFiche,
			icon: ListIcon,
		},
		{
			to: "/documents/$documentId/note" as const,
			title: m.document_note(),
			description: m.document_note_description(),
			action: m.document_read_note(),
			available: document.hasNote,
			icon: BookOpenIcon,
		},
	];

	return (
		<div className="min-h-screen">
			<AppHeader />
			<main className="mx-auto w-full max-w-4xl px-6 py-8 sm:py-12">
				<header className="mt-6 text-center">
					<h1 className="text-balance break-words font-heading text-xl leading-relaxed sm:text-2xl">
						{document.title}
					</h1>
					{details && (
						<p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
							{details}
						</p>
					)}
				</header>
				<section className="mt-12" aria-label={m.document_choose()}>
					<div className="grid gap-5 sm:grid-cols-2">
						{formats.map((format) => {
							const Icon = format.icon;
							const body = (
								<>
									<Icon
										aria-hidden="true"
										className="size-6 text-muted-foreground"
										strokeWidth={1.5}
									/>
									<h3 className="mt-6 font-heading text-xl">{format.title}</h3>
									<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
										{format.description}
									</p>
									<span className="mt-auto flex items-center gap-2 pt-8 text-sm">
										{format.available
											? format.action
											: m.document_format_unavailable()}
										{format.available && (
											<ArrowRightIcon aria-hidden="true" className="size-4" />
										)}
									</span>
								</>
							);
							const className =
								"flex h-full flex-col border bg-card p-7 sm:p-8";
							return format.available ? (
								<Link
									key={format.to}
									to={format.to}
									params={{ documentId: document.id }}
									className={`${className} transition-colors hover:border-foreground/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none`}
								>
									{body}
								</Link>
							) : (
								<div key={format.to} className={`${className} opacity-60`}>
									{body}
								</div>
							);
						})}
					</div>
				</section>
				<div className="mx-auto mt-16 grid max-w-xl gap-6 text-center sm:grid-cols-2">
					<div>
						<Link
							to="/"
							aria-describedby="document-back-description"
							className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-4" />
							{m.document_back()}
						</Link>
						<p
							id="document-back-description"
							className="mt-2 text-xs leading-relaxed text-muted-foreground"
						>
							{m.document_back_description()}
						</p>
					</div>
					<div>
						{document.pdfUrl ? (
							<a
								href={document.pdfUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-describedby="document-pdf-description"
								className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
							>
								{m.document_read_pdf()}
								<ArrowRightIcon aria-hidden="true" className="size-4" />
							</a>
						) : (
							<span
								aria-disabled="true"
								aria-describedby="document-pdf-description"
								className="inline-flex items-center gap-2 text-sm text-muted-foreground"
							>
								{m.document_read_pdf()}
								<ArrowRightIcon aria-hidden="true" className="size-4" />
							</span>
						)}
						<p
							id="document-pdf-description"
							className="mt-2 text-xs leading-relaxed text-muted-foreground"
						>
							{document.pdfUrl
								? m.document_pdf_description()
								: m.document_pdf_unavailable()}
						</p>
					</div>
				</div>
			</main>
		</div>
	);
}
