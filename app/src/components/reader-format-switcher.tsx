import { Link } from "@tanstack/react-router";
import { BookOpenIcon, BrainIcon, ListIcon } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages";

type ReaderFormatSwitcherProps = {
	documentId: string;
	hasFiche: boolean;
	hasNote: boolean;
	hasReasoning: boolean;
};

export function ReaderFormatSwitcher({
	documentId,
	hasFiche,
	hasNote,
	hasReasoning,
}: ReaderFormatSwitcherProps) {
	const formats = [
		{
			to: "/documents/$documentId/reasoning" as const,
			label: m.document_reasoning(),
			available: hasReasoning,
			icon: BrainIcon,
		},
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
				className="pointer-events-auto grid w-full max-w-[24rem] grid-cols-3 gap-0.5 border bg-background p-0.5 shadow-xs"
			>
				{formats.map((format) => {
					const Icon = format.icon;
					const content = (
						<>
							<Icon
								aria-hidden="true"
								className="hidden size-3.5 shrink-0 sm:block"
							/>
							{format.label}
						</>
					);
					const className =
						"h-9 min-h-9 min-w-0 gap-1.5 rounded-full px-0 py-1.5 text-sm transition-colors motion-reduce:transition-none";
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
