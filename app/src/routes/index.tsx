import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "#/components/app-header.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="flex w-full flex-col">
			<AppHeader />
			<main>hi there</main>
			<footer></footer>
		</div>
	);
}
