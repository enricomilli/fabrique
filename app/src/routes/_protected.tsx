import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "#/lib/fns/session-fns";

export const Route = createFileRoute("/_protected")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		return { session };
	},
	component: Outlet,
});
