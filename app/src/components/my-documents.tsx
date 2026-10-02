import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { DocumentCard } from "#/components/document-grid";
import { Button } from "#/components/ui/button";
import type { DocumentSummary } from "#/lib/docs-fns";
import { m } from "#/paraglide/messages";

export function MyDocuments({
	documents,
	failed,
	onRetry,
}: {
	documents: DocumentSummary[];
	failed: boolean;
	onRetry: () => void;
}) {
	return (
		<section
			aria-labelledby="my-documents"
			className="px-6 pt-0 pb-10 sm:px-10 lg:px-16"
		>
			<div className="mx-auto max-w-360">
				<div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
					<h1 id="my-documents" className="font-heading text-lg">
						{m.documents_my()}
					</h1>
					<Link
						to="/my-documents"
						className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
					>
						{m.documents_see_all()}
						<ArrowRightIcon aria-hidden="true" className="size-4" />
					</Link>
				</div>
				{failed && (
					<div role="alert" className="mb-4 flex flex-wrap items-center gap-3">
						<p>{m.documents_error()}</p>
						<Button variant="outline" onClick={onRetry}>
							{m.documents_retry()}
						</Button>
					</div>
				)}
				<ul className="grid auto-cols-[100%] grid-flow-col gap-6 overflow-x-auto pb-4 min-[480px]:auto-cols-[calc((100%-1.5rem)/2)] md:auto-cols-[calc((100%-3rem)/3)] xl:auto-cols-[calc((100%-4.5rem)/4)] min-[1440px]:auto-cols-[calc((100%-6rem)/5)]">
					<li className="min-w-0">
						<Link
							to="/documents/new"
							className="group block min-w-0 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
						>
							<div className="flex aspect-[5/3] items-center justify-center border border-dashed border-foreground/30 bg-card p-4 shadow-xs transition-colors duration-150 group-hover:bg-muted/40 group-focus-visible:bg-muted/40 motion-reduce:transition-none">
								<PlusIcon aria-hidden="true" className="size-6" />
							</div>
							<h3 className="mt-2.5 font-heading text-sm leading-relaxed">
								{m.upload_title()}
							</h3>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								{documents.length === 0 && !failed
									? m.documents_create_first()
									: m.upload_description()}
							</p>
						</Link>
					</li>
					{documents.map((document) => (
						<li key={document.id} className="min-w-0">
							<DocumentCard document={document} />
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
