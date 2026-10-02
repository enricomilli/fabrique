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

export const Route = createFileRoute("/_protected/documents/$documentId/")({
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
				<div className="mx-auto mt-16 grid max-w-2xl gap-6 text-center sm:grid-cols-2">
					<Link
						to="/"
						aria-labelledby="document-back-label"
						aria-describedby="document-back-description"
						className="flex flex-col items-center text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
					>
						<span
							id="document-back-label"
							className="inline-flex items-center gap-2 text-sm"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-4" />
							{m.document_back()}
						</span>
						<span
							id="document-back-description"
							className="mt-2 text-xs leading-relaxed"
						>
							{m.document_back_description()}
						</span>
					</Link>
					{document.pdfUrl ? (
						<a
							href={document.pdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-labelledby="document-pdf-label"
							aria-describedby="document-pdf-description"
							className="flex flex-col items-center text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
						>
							<span
								id="document-pdf-label"
								className="inline-flex items-center gap-2 text-sm"
							>
								{m.document_read_pdf()}
								<ArrowRightIcon aria-hidden="true" className="size-4" />
							</span>
							<span
								id="document-pdf-description"
								className="mt-2 text-xs leading-relaxed"
							>
								{m.document_pdf_description()}
							</span>
						</a>
					) : (
						<div
							className="flex flex-col items-center text-muted-foreground"
							aria-disabled="true"
						>
							<span className="inline-flex items-center gap-2 text-sm">
								{m.document_read_pdf()}
								<ArrowRightIcon aria-hidden="true" className="size-4" />
							</span>
							<p className="mt-2 text-xs leading-relaxed">
								{m.document_pdf_unavailable()}
							</p>
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
