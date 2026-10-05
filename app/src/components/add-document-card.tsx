import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { m } from "#/paraglide/messages";

export function AddDocumentCard({
	firstDocument = false,
}: {
	firstDocument?: boolean;
}) {
	return (
		<Link
			to="/documents/new"
			className="group block min-w-0 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
		>
			<div className="flex aspect-[5/3] items-center justify-center border border-dashed border-foreground/30 bg-card p-4 shadow-xs transition-colors duration-150 group-hover:bg-muted/40 group-focus-visible:bg-muted/40 motion-reduce:transition-none">
				<PlusIcon aria-hidden="true" className="size-6" />
			</div>
			<h3 className="mt-2.5 font-heading text-sm leading-relaxed">
				{m.documents_add_new()}
			</h3>
			<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
				{firstDocument ? m.documents_create_first() : m.upload_description()}
			</p>
		</Link>
	);
}
