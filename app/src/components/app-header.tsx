import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "#/components/language-switcher";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

type AppHeaderProps = {
	scrollThreshold?: number;
};

export const AppHeader = ({ scrollThreshold = 8 }: AppHeaderProps) => {
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
			className={`sticky top-0 z-50 flex w-full flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3 transition-colors duration-150 motion-reduce:transition-none ${scrolled ? "border-border" : "border-transparent"}`}
		>
			<Link to="/">
				<h2 className="font-serif text-[19px]">Fabrique</h2>
			</Link>
			<div className="ms-auto flex items-center gap-2">
				<Link
					to="/feedback"
					className={buttonVariants({
						variant: "outline",
						className: "font-normal",
					})}
				>
					{m.give_feedback()}
				</Link>
				<LanguageSwitcher />
			</div>
		</header>
	);
};
