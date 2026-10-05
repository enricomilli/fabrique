import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
	useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import { getDocument } from "#/lib/docs-fns";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_protected/documents/$documentId")({
	loader: async ({ params }) => {
		const document = await getDocument({ data: { id: params.documentId } });
		if (!document) throw notFound();
		return document;
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: loaderData ? `${loaderData.title} | Fabrique` : "Fabrique" },
		],
	}),
	component: DocumentLayout,
	notFoundComponent: () => (
		<DocumentMessage>{m.document_not_found()}</DocumentMessage>
	),
	errorComponent: DocumentError,
});

function DocumentMessage({ children }: { children: ReactNode }) {
	return (
		<>
			<AppHeader />
			<main className="mx-auto max-w-3xl px-6 py-16 text-center">
				<h1 className="font-heading text-xl">{children}</h1>
				<Link
					to="/"
					className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4"
				>
					{m.document_back()}
				</Link>
			</main>
		</>
	);
}

function DocumentError() {
	const router = useRouter();
	return (
		<>
			<AppHeader />
			<main className="mx-auto max-w-3xl px-6 py-16 text-center">
				<h1 className="font-heading text-xl">{m.document_load_error()}</h1>
				<div className="mt-6 flex items-center justify-center gap-4">
					<Button
						variant="outline"
						onClick={() => {
							void router.invalidate();
						}}
					>
						{m.documents_retry()}
					</Button>
					<Link to="/" className="text-sm underline underline-offset-4">
						{m.document_back()}
					</Link>
				</div>
			</main>
		</>
	);
}

function DocumentLayout() {
	const document = Route.useLoaderData();
	const router = useRouter();
	const [refreshFailed, setRefreshFailed] = useState(false);

	useEffect(() => {
		if (document.generationCompleted) return;
		let stopped = false;
		let timeout: ReturnType<typeof setTimeout>;
		async function refresh() {
			try {
				await router.invalidate({
					sync: true,
					filter: (match) =>
						match.routeId === Route.id &&
						match.params.documentId === document.id,
				});
				if (!stopped) setRefreshFailed(false);
			} catch {
				if (!stopped) setRefreshFailed(true);
			}
			if (!stopped) timeout = setTimeout(refresh, 1000);
		}
		timeout = setTimeout(refresh, 1000);
		return () => {
			stopped = true;
			clearTimeout(timeout);
		};
	}, [document.id, document.generationCompleted, router]);

	return (
		<>
			{refreshFailed && (
				<output className="block bg-muted px-6 py-3 text-sm">
					{m.generation_refresh_error()}
				</output>
			)}
			<Outlet />
		</>
	);
}
