import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useId, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { DocumentCard } from "#/components/document-grid";
import { Button } from "#/components/ui/button";
import { getMyDocuments } from "#/lib/docs-fns";
import { filterDocuments } from "#/lib/document-list";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_protected/my-documents")({
	loader: () => getMyDocuments(),
	component: MyDocumentsPage,
	errorComponent: MyDocumentsError,
});

function MyDocumentsError() {
	const router = useRouter();
	return (
		<div className="min-h-screen">
			<AppHeader />
			<main className="mx-auto max-w-3xl px-6 py-12">
				<h1 className="font-heading text-lg">{m.documents_my()}</h1>
				<div role="alert" className="mt-6 space-y-4">
					<p>{m.documents_error()}</p>
					<Button
						variant="outline"
						onClick={() => {
							void router.invalidate();
						}}
					>
						{m.documents_retry()}
					</Button>
				</div>
			</main>
		</div>
	);
}

function MyDocumentsPage() {
	const documents = Route.useLoaderData();
	const [query, setQuery] = useState("");
	const searchId = useId();
	const visible = filterDocuments(
		documents,
		query,
		"all",
		"recent",
		getLocale(),
	);
	return (
		<div className="min-h-screen">
			<AppHeader>
				<search className="min-w-0 flex-1 sm:max-w-[480px]">
					<label htmlFor={searchId} className="sr-only">
						{m.search_label()}
					</label>
					<div className="flex h-8 items-center gap-3 border border-input bg-muted/40 px-3 focus-within:border-ring focus-within:outline-2 focus-within:outline-ring">
						<SearchIcon
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<input
							id={searchId}
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={m.documents_header_search()}
							className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
						/>
					</div>
				</search>
			</AppHeader>
			<main className="px-6 py-10 sm:px-10 lg:px-16">
				<div className="mx-auto max-w-[1440px]">
					<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
						<h1 className="font-heading text-lg leading-none">
							{m.documents_my()}
						</h1>
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={<Link to="/documents/new" />}
						>
							<PlusIcon aria-hidden="true" className="size-3.5" />
							{m.documents_add_new()}
						</Button>
					</div>
					{visible.length > 0 ? (
						<ul className="grid grid-cols-1 gap-x-6 gap-y-7 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1440px]:grid-cols-5">
							{visible.map((document) => (
								<li key={document.id}>
									<DocumentCard document={document} />
								</li>
							))}
						</ul>
					) : (
						<div className="border border-dashed p-10 text-center">
							<p className="text-sm text-muted-foreground">
								{documents.length > 0
									? m.documents_no_results()
									: m.documents_create_first()}
							</p>
							<Link
								to="/documents/new"
								className="mt-4 inline-flex min-h-10 items-center text-sm underline underline-offset-4"
							>
								{m.upload_title()}
							</Link>
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
