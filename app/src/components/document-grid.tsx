import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "#/components/ui/drawer";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { DocumentSummary } from "#/lib/docs-fns";
import {
	type DocumentFilter,
	type DocumentSort,
	documentStatus,
	filterDocuments,
} from "#/lib/document-list";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

type DocumentGridProps = {
	documents: DocumentSummary[];
	query?: string;
	failed?: boolean;
	onReset: () => void;
	onRetry: () => void;
};

const controlClass =
	"min-h-9 border border-border bg-transparent px-3 text-xs font-medium transition-colors hover:border-foreground/50 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function statusLabels() {
	return {
		both: m.documents_status_both(),
		fiche: m.documents_status_fiche(),
		note: m.documents_status_note(),
		source: m.documents_status_source(),
	};
}

function DocumentCard({ document }: { document: DocumentSummary }) {
	const status = documentStatus(document);
	const metadata = document.metadata;
	const details = [
		metadata?.auteur?.trim(),
		metadata?.etablissement?.trim(),
		metadata?.annee?.trim(),
		metadata
			? m.documents_pages({
					count: new Intl.NumberFormat(getLocale()).format(metadata.pages),
				})
			: null,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<Link
			to="/documents/$documentId"
			params={{ documentId: document.id }}
			aria-label={document.title}
			className="group block min-w-0 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
		>
			<article className="min-w-0">
				<div
					aria-hidden="true"
					className="aspect-[5/3] overflow-hidden border border-foreground/15 bg-card p-4 shadow-xs transition-colors duration-150 group-hover:border-foreground/40 group-hover:bg-muted/40 group-focus-visible:bg-muted/40 motion-reduce:transition-none"
				>
					{/*<p className="mb-2 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
					{document.hasFiche
						? m.documents_preview_fiche()
						: document.hasNote
							? m.documents_status_note()
							: m.documents_preview_source()}
				</p>*/}
					<p className="line-clamp-2 break-words font-heading text-[11px] leading-snug font-semibold capitalize">
						{document.title.toLocaleLowerCase(getLocale())}
					</p>
					<div className="my-2 h-[3px] w-1/4 bg-blue-900 dark:bg-blue-300" />
					<p className="line-clamp-8 break-words font-heading text-[9px] leading-relaxed text-foreground/75">
						{document.preview}
					</p>
				</div>
				{document.preview && <p className="sr-only">{document.preview}</p>}
				<h3
					className="mt-2.5 line-clamp-2 break-words font-heading text-sm leading-relaxed capitalize"
					title={document.title}
				>
					{document.title.toLocaleLowerCase(getLocale())}
				</h3>
				<p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
					{details || document.thesis}
				</p>
				<div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<span
						className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] leading-none ${
							status === "source"
								? "border-border text-muted-foreground"
								: "border-blue-800/25 bg-blue-100/40 text-blue-900 dark:border-blue-300/30 dark:bg-blue-950/40 dark:text-blue-200"
						}`}
					>
						{statusLabels()[status]}
					</span>
					{metadata?.discipline?.trim() && (
						<span className="min-w-0 break-words text-[11px] leading-relaxed text-muted-foreground">
							{metadata.discipline}
						</span>
					)}
				</div>
			</article>
		</Link>
	);
}

export function DocumentGrid({
	documents,
	query = "",
	failed = false,
	onReset,
	onRetry,
}: DocumentGridProps) {
	const id = useId();
	const [filter, setFilter] = useState<DocumentFilter>("all");
	const [sort, setSort] = useState<DocumentSort>("recent");
	const [discipline, setDiscipline] = useState("");
	const locale = getLocale();
	const disciplines = [
		...new Set(
			documents.flatMap((document) => {
				const value = document.metadata?.discipline?.trim();
				return value ? [value] : [];
			}),
		),
	].sort((left, right) => left.localeCompare(right, locale));
	const visible = filterDocuments(
		documents,
		query,
		filter,
		sort,
		locale,
		discipline,
	);
	const count = new Intl.NumberFormat(locale).format(visible.length);
	const labels = statusLabels();
	const sortOptions = [
		{ value: "recent", label: m.documents_recent() },
		{ value: "title", label: m.documents_sort_title() },
	];
	const disciplineOptions = [
		{ value: "", label: m.documents_all() },
		...disciplines.map((value) => ({ value, label: value })),
	];
	const statusOptions = [
		{ value: "all", label: m.documents_all() },
		...Object.entries(labels).map(([value, label]) => ({ value, label })),
	];

	function resetFilters() {
		setFilter("all");
		setSort("recent");
		setDiscipline("");
	}

	function reset() {
		resetFilters();
		onReset();
	}

	return (
		<section
			aria-labelledby={`${id}-title`}
			className="flex-1 px-6 pb-6 sm:px-10 lg:px-16"
		>
			<div className="mx-auto max-w-[1440px]">
				<h2 id={`${id}-title`} className="sr-only">
					{m.documents_title()}
				</h2>
				<output className="sr-only">
					{!failed &&
						(visible.length === 1
							? m.documents_count_single({ count })
							: m.documents_count({ count }))}
				</output>
				<DrawerContent className="motion-reduce:transition-none">
					<DrawerHeader>
						<DrawerTitle>{m.documents_controls()}</DrawerTitle>
						<DrawerDescription>
							{failed
								? m.documents_error()
								: visible.length === 1
									? m.documents_count_single({ count })
									: m.documents_count({ count })}
						</DrawerDescription>
					</DrawerHeader>
					<fieldset className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
						<legend className="sr-only">{m.documents_controls()}</legend>
						<div className="flex min-w-0 flex-col gap-1.5">
							<label
								htmlFor={`${id}-sort`}
								className="text-xs text-muted-foreground"
							>
								{m.documents_sort()}
							</label>
							<Select
								items={sortOptions}
								value={sort}
								onValueChange={(value) => {
									if (value === "recent" || value === "title") setSort(value);
								}}
							>
								<SelectTrigger id={`${id}-sort`} className="w-full min-w-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									{sortOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex min-w-0 flex-col gap-1.5">
							<label
								htmlFor={`${id}-discipline`}
								className="text-xs text-muted-foreground"
							>
								{m.documents_discipline()}
							</label>
							<Select
								items={disciplineOptions}
								value={discipline}
								disabled={disciplines.length === 0}
								onValueChange={(value) => {
									if (value !== null) setDiscipline(value);
								}}
							>
								<SelectTrigger
									id={`${id}-discipline`}
									className="w-full min-w-0"
									title={discipline || undefined}
								>
									<SelectValue className="min-w-0 truncate" />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									{disciplineOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<span className="whitespace-normal break-words">
												{option.label}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex min-w-0 flex-col gap-1.5">
							<label
								htmlFor={`${id}-status`}
								className="text-xs text-muted-foreground"
							>
								{m.documents_state()}
							</label>
							<Select
								items={statusOptions}
								value={filter}
								onValueChange={(value) => {
									if (
										value === "all" ||
										value === "both" ||
										value === "fiche" ||
										value === "note" ||
										value === "source"
									)
										setFilter(value);
								}}
							>
								<SelectTrigger id={`${id}-status`} className="w-full min-w-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									{statusOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</fieldset>
					<DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
						<Button type="button" variant="outline" onClick={resetFilters}>
							{m.documents_reset_filters()}
						</Button>
						<DrawerClose render={<Button />}>
							{m.documents_show_results()}
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
				{failed ? (
					<div role="alert" className="border border-dashed p-10 text-center">
						<p className="text-sm text-muted-foreground">
							{m.documents_error()}
						</p>
						<button
							type="button"
							className={`${controlClass} mt-4`}
							onClick={onRetry}
						>
							{m.documents_retry()}
						</button>
					</div>
				) : visible.length > 0 ? (
					<ul className="grid grid-cols-1 gap-x-6 gap-y-7 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1440px]:grid-cols-5">
						{visible.map((document) => (
							<li key={document.id}>
								<DocumentCard document={document} />
							</li>
						))}
					</ul>
				) : (
					<div className="border border-dashed p-10 text-center">
						<p className="font-heading text-base">
							{documents.length
								? m.documents_no_results()
								: m.documents_empty()}
						</p>
						{documents.length > 0 && (
							<button
								type="button"
								className={`${controlClass} mt-4`}
								onClick={reset}
							>
								{m.documents_all()}
							</button>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
