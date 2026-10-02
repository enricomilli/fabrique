import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { AppHeader } from "#/components/app-header.tsx";
import { DocumentGrid } from "#/components/document-grid";
import { MyDocuments } from "#/components/my-documents";
import { SearchBar } from "#/components/search-bar";
import { Drawer } from "#/components/ui/drawer";
import { getDocuments, getMyDocuments } from "#/lib/docs-fns";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_protected/")({
	validateSearch: z.object({
		q: z.string().trim().optional().catch(undefined),
	}),
	loader: async () => {
		const [publicResult, ownedResult] = await Promise.allSettled([
			getDocuments(),
			getMyDocuments(),
		]);
		return {
			documents: publicResult.status === "fulfilled" ? publicResult.value : [],
			myDocuments: ownedResult.status === "fulfilled" ? ownedResult.value : [],
			failed: publicResult.status === "rejected",
			myFailed: ownedResult.status === "rejected",
		};
	},
	component: Home,
});

function Home() {
	const { q } = Route.useSearch();
	const { documents, myDocuments, failed, myFailed } = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const router = useRouter();

	return (
		<div className="flex min-h-screen w-full flex-col">
			<AppHeader />
			<main className="flex flex-1 flex-col pb-26">
				<Drawer swipeDirection="right" showSwipeHandle>
					<SearchBar
						key={q ?? ""}
						initialQuery={q}
						documentCount={failed ? undefined : documents.length}
						onSearch={(query) => {
							void navigate({ search: { q: query }, resetScroll: false });
						}}
					/>
					<MyDocuments
						documents={myDocuments}
						failed={myFailed}
						onRetry={() => {
							void router.invalidate();
						}}
					/>
					<section aria-labelledby="public-documents">
						<h2
							id="public-documents"
							className="mx-auto mb-6 max-w-[1568px] px-6 font-heading text-lg sm:px-10 lg:px-16"
						>
							{m.documents_public()}
						</h2>
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
					</section>
				</Drawer>
			</main>
			<footer></footer>
		</div>
	);
}
