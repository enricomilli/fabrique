import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { AppHeader } from "#/components/app-header.tsx";
import { DocumentGrid } from "#/components/document-grid";
import { SearchBar } from "#/components/search-bar";
import { Drawer } from "#/components/ui/drawer";
import { type DocumentSummary, getDocuments } from "#/lib/docs-fns";

export const Route = createFileRoute("/")({
	validateSearch: z.object({
		q: z.string().trim().optional().catch(undefined),
	}),
	loader: async (): Promise<{
		documents: DocumentSummary[];
		failed: boolean;
	}> => {
		try {
			return { documents: await getDocuments(), failed: false };
		} catch {
			return { documents: [], failed: true };
		}
	},
	component: Home,
});

function Home() {
	const { q } = Route.useSearch();
	const { documents, failed } = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const router = useRouter();

	return (
		<div className="flex min-h-screen w-full flex-col">
			<AppHeader />
			<main className="flex flex-1 flex-col">
				<Drawer swipeDirection="right" showSwipeHandle>
					<SearchBar
						key={q ?? ""}
						initialQuery={q}
						documentCount={failed ? undefined : documents.length}
						onSearch={(query) => {
							void navigate({ search: { q: query }, resetScroll: false });
						}}
					/>
					<DocumentGrid
						documents={documents}
						query={q}
						failed={failed}
						onReset={() => {
							void navigate({ search: {}, resetScroll: false });
						}}
						onRetry={() => {
							void router.invalidate();
						}}
					/>
				</Drawer>
			</main>
			<footer></footer>
		</div>
	);
}
