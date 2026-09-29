import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "#/components/language-switcher";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

type AppHeaderProps = {
	scrollThreshold?: number;
	documentTitle?: string;
	showFeedback?: boolean;
};

export const AppHeader = ({
	scrollThreshold = 8,
	documentTitle,
	showFeedback = true,
}: AppHeaderProps) => {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		function updateScrolled() {
			setScrolled(window.scrollY > scrollThreshold);
		}

		updateScrolled();
		window.addEventListener("scroll", updateScrolled, { passive: true });
		return () => window.removeEventListener("scroll", updateScrolled);
	}, [scrollThreshold]);

	return (
		<header
			data-app-header
			data-scrolled={scrolled}
			className={`sticky top-0 z-50 flex w-full items-center justify-between gap-3 border-b bg-background px-6 py-3 transition-colors duration-150 motion-reduce:transition-none ${documentTitle ? "flex-nowrap" : "flex-wrap"} ${scrolled ? "border-border" : "border-transparent"}`}
		>
			<div className="flex min-w-0 flex-1 items-baseline gap-6">
				<Link to="/" className="shrink-0">
					<h2 className="font-serif text-[19px]">Fabrique</h2>
				</Link>
				{documentTitle && (
					<p
						className="min-w-0 truncate text-sm text-muted-foreground"
						title={documentTitle}
					>
						{documentTitle}
					</p>
				)}
			</div>
			<div className="ms-auto flex shrink-0 items-center gap-2">
				{showFeedback && (
					<Link
						to="/feedback"
						className={buttonVariants({
							variant: "outline",
							className: "font-normal",
						})}
					>
						{m.give_feedback()}
					</Link>
				)}
				<LanguageSwitcher />
			</div>
		</header>
	);
};
