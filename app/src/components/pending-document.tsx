import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

export function PendingDocument({ title }: { title: string }) {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	return (
		<div className="min-h-screen">
			<AppHeader />
			<main className="mx-auto max-w-2xl px-6 py-16 text-center">
				<p className="mb-6 break-words font-heading text-muted-foreground">
					{title}
				</p>
				<h1 className="text-balance font-heading text-2xl">
					{m.document_generating()}
				</h1>
				<output className="mt-4 block text-muted-foreground">
					{m.document_queued()}
				</output>
				<p className="mt-3 text-sm text-muted-foreground">
					{m.document_queue_description()}
				</p>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-4">
					<Button
						variant="outline"
						className="min-h-10"
						disabled={refreshing}
						onClick={async () => {
							setRefreshing(true);
							try {
								await router.invalidate();
							} finally {
								setRefreshing(false);
							}
						}}
					>
						{m.document_refresh()}
					</Button>
					<Link
						to="/"
						className="inline-flex min-h-10 items-center text-sm underline underline-offset-4"
					>
						{m.document_back()}
					</Link>
				</div>
			</main>
		</div>
	);
}
