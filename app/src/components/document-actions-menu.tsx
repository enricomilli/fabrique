import { useRouter } from "@tanstack/react-router";
import { EllipsisVertical, Globe, Lock, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	type DocumentSummary,
	deleteDocument,
	updateDocumentVisibility,
} from "#/lib/docs-fns";
import { m } from "#/paraglide/messages";

export function DocumentActionsMenu({
	document,
}: {
	document: DocumentSummary;
}) {
	const router = useRouter();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPublic, setIsPublic] = useState(document.public);
	const [previousPublic, setPreviousPublic] = useState(document.public);

	if (previousPublic !== document.public) {
		setPreviousPublic(document.public);
		setIsPublic(document.public);
	}

	async function runAction(action: "visibility" | "delete") {
		if (pending) return;
		setPending(true);
		setError(null);
		try {
			if (action === "delete") {
				await deleteDocument({ data: { id: document.id } });
				setDeleteOpen(false);
			} else {
				await updateDocumentVisibility({
					data: { id: document.id, public: !isPublic },
				});
				setIsPublic(!isPublic);
			}
		} catch {
			setError(
				action === "delete"
					? m.document_delete_error()
					: m.document_actions_error(),
			);
			setPending(false);
			return;
		}
		try {
			await router.invalidate();
		} catch {
			setError(m.document_actions_refresh_error());
		} finally {
			setPending(false);
		}
	}

	return (
		<>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<DropdownMenuTrigger
					ref={triggerRef}
					aria-label={m.document_actions_label({ title: document.title })}
					aria-busy={pending}
					className="absolute end-2 top-2 z-10 flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs outline-none transition-opacity duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-popup-open:opacity-100 motion-reduce:transition-none"
				>
					<EllipsisVertical aria-hidden="true" className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-auto min-w-44"
					finalFocus={deleteOpen ? false : undefined}
				>
					<DropdownMenuItem
						disabled={pending}
						onClick={() => void runAction("visibility")}
					>
						{isPublic ? (
							<Lock aria-hidden="true" />
						) : (
							<Globe aria-hidden="true" />
						)}
						{isPublic ? m.document_make_private() : m.document_make_public()}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={pending}
						onClick={() => {
							setError(null);
							setDeleteOpen(true);
						}}
					>
						<Trash2 aria-hidden="true" />
						{m.document_delete()}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					if (!pending) setDeleteOpen(open);
				}}
			>
				<AlertDialogContent finalFocus={triggerRef}>
					<AlertDialogHeader>
						<AlertDialogTitle>{m.document_delete_title()}</AlertDialogTitle>
						<AlertDialogDescription>
							{m.document_delete_description({ title: document.title })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>
							{m.document_actions_cancel()}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={pending}
							onClick={() => void runAction("delete")}
						>
							{pending ? m.document_deleting() : m.document_delete()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{error && !deleteOpen && (
				<p role="alert" className="mt-2 text-sm text-destructive">
					{error}
				</p>
			)}
		</>
	);
}
