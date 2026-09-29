import { Link } from "@tanstack/react-router";
import { BookOpenIcon, ListIcon } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

type ReaderFormatSwitcherProps = {
	documentId: string;
	hasFiche: boolean;
	hasNote: boolean;
};

export function ReaderFormatSwitcher({
	documentId,
	hasFiche,
	hasNote,
}: ReaderFormatSwitcherProps) {
	const formats = [
		{
			to: "/documents/$documentId/fiche" as const,
			label: m.documents_status_fiche(),
			available: hasFiche,
			icon: ListIcon,
		},
		{
			to: "/documents/$documentId/note" as const,
			label: m.documents_status_note(),
			available: hasNote,
			icon: BookOpenIcon,
		},
	];

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
			<nav
				aria-label={m.document_choose()}
				className="pointer-events-auto grid w-full max-w-[13rem] grid-cols-2 gap-0.5 border bg-background p-0.5 shadow-xs"
			>
				{formats.map((format) => {
					const Icon = format.icon;
					const content = (
						<>
							<Icon aria-hidden="true" className="size-4 shrink-0" />
							{format.label}
						</>
					);
					const className =
						"min-h-8 rounded-full px-0 py-2 transition-colors motion-reduce:transition-none";
					return format.available ? (
						<Link
							key={format.to}
							to={format.to}
							params={{ documentId }}
							activeOptions={{ exact: true }}
							activeProps={{
								className: buttonVariants({ variant: "default", className }),
							}}
							inactiveProps={{
								className: buttonVariants({ variant: "ghost", className }),
							}}
						>
							{content}
						</Link>
					) : (
						<span
							key={format.to}
							aria-disabled="true"
							title={m.document_format_unavailable()}
							className={buttonVariants({
								variant: "ghost",
								className: `${className} pointer-events-none opacity-50`,
							})}
						>
							{content}
						</span>
					);
				})}
			</nav>
		</div>
	);
}
