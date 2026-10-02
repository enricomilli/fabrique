import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { LanguageSwitcher } from "#/components/language-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { buttonVariants } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { authClient } from "#/integrations/better-auth/auth-client";
import { m } from "#/paraglide/messages";

type AppHeaderProps = {
	scrollThreshold?: number;
	documentTitle?: string;
	showFeedback?: boolean;
	children?: ReactNode;
};

export const AppHeader = ({
	scrollThreshold = 8,
	documentTitle,
	showFeedback = true,
	children,
}: AppHeaderProps) => {
	const [scrolled, setScrolled] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	const [signOutFailed, setSignOutFailed] = useState(false);
	const router = useRouter();
	const protectedMatch = useMatch({ from: "/_protected", shouldThrow: false });
	const user = protectedMatch?.context.session.user;
	const initials =
		user?.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => Array.from(part)[0] ?? "")
			.join("")
			.toLocaleUpperCase() || "?";

	async function signOut() {
		if (signingOut) return;
		setSigningOut(true);
		setSignOutFailed(false);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				setSignOutFailed(true);
				return;
			}
			await router.navigate({ to: "/login" });
			await router.invalidate();
		} catch {
			setSignOutFailed(true);
		} finally {
			setSigningOut(false);
		}
	}

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
			<div
				className={`flex min-w-0 flex-1 gap-6 ${children ? "items-center" : "items-baseline"}`}
			>
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
				{children}
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
				{user && (
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-label={m.auth_user_menu()}
							disabled={signingOut}
							className="rounded-full outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
						>
							<Avatar>
								{user.image && <AvatarImage src={user.image} alt="" />}
								<AvatarFallback>{initials}</AvatarFallback>
							</Avatar>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem
								disabled={signingOut}
								onClick={() => {
									void signOut();
								}}
							>
								<LogOutIcon aria-hidden="true" />
								{m.auth_log_out()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{signOutFailed && (
					<p role="alert" className="text-xs text-destructive">
						{m.auth_log_out_error()}
					</p>
				)}
			</div>
		</header>
	);
};
