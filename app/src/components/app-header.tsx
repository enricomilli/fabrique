import { Link } from "@tanstack/react-router";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

export const AppHeader = () => {
	return (
		<header className="sticky top-0 z-50 flex w-full flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
			<Link to="/">
				<h2 className="font-serif text-[19px]">Fabrique</h2>
			</Link>
			<Link
				to="/feedback"
				className={buttonVariants({
					variant: "outline",
					className: "ms-auto font-normal",
				})}
			>
				{m.give_feedback()}
			</Link>
		</header>
	);
};
