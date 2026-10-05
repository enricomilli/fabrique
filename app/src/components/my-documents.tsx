import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { AddDocumentCard } from "#/components/add-document-card";
import { DocumentCard } from "#/components/document-grid";
import { Button } from "#/components/ui/button";
import type { DocumentSummary } from "#/lib/docs-fns";
import { filterDocuments } from "#/lib/document-list";
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
	const sortedDocuments = filterDocuments(documents, "", "all", "recent");
	const pendingDocuments = sortedDocuments.filter(
		(document) => !document.generationCompleted,
	);
	const completedDocuments = sortedDocuments.filter(
		(document) => document.generationCompleted,
	);
	const recentDocuments = [
		...pendingDocuments,
		...completedDocuments.slice(0, Math.max(0, 3 - pendingDocuments.length)),
	];

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
				<ul className="grid grid-cols-1 gap-6 pb-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
					<li className="min-w-0">
						<AddDocumentCard
							firstDocument={documents.length === 0 && !failed}
						/>
					</li>
					{recentDocuments.map((document) => (
						<li key={document.id} className="min-w-0">
							<DocumentCard document={document} canManage />
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
