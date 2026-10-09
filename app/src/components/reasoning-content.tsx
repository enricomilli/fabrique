import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import {
	type ReactNode,
	type Ref,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { pdfPageUrl, safePdfUrl, validPdfPage } from "#/lib/page-citations";
import type {
	Reasoning,
	ReasoningIteration,
	ReasoningIterationBarsSection,
	ReasoningKpisSection,
	ReasoningMostReadSection,
	ReasoningNeverOpenedSection,
	ReasoningReadingMapEntry,
	ReasoningReadingMapSection,
} from "#/lib/reasoning.schema";
import {
	reasoningEmptyFeedback,
	reasoningGesture,
	reasoningKind,
	reasoningKpi,
	reasoningMapSubtitle,
	reasoningNumber,
	reasoningPercent,
	reasoningSeconds,
	reasoningWords,
} from "#/lib/reasoning-ui";
import { m } from "#/paraglide/messages";

export type ReasoningContentProps = {
	reasoning: Reasoning | null;
	title: string;
	pdfUrl: string | null;
};

const focusClass =
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const labelClass =
	"font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase";

function share(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function PageLink({
	pdfUrl,
	page,
	children,
}: {
	pdfUrl: string | null;
	page: number;
	children: ReactNode;
}) {
	const url = safePdfUrl(pdfUrl);
	if (!url || !validPdfPage(page)) return <span>{children}</span>;
	return (
		<a
			href={pdfPageUrl(url, page)}
			target="_blank"
			rel="noopener noreferrer"
			className={`underline decoration-muted-foreground underline-offset-4 hover:text-primary ${focusClass}`}
		>
			{children}
			<span className="sr-only">
				{" "}
				· {m.pdf_citation({ page: reasoningNumber(page) })}
			</span>
		</a>
	);
}

function EmptyItems() {
	return <p className="text-muted-foreground">{m.reasoning_no_items()}</p>;
}

function Disclosure({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<Collapsible className="mt-2">
			<CollapsibleTrigger
				render={<Button variant="ghost" size="sm" />}
				className="group h-auto min-h-8 justify-start whitespace-normal px-0 font-mono text-xs text-muted-foreground"
			>
				<ChevronRight
					aria-hidden="true"
					className="size-3.5 group-data-open:rotate-90"
				/>
				{label}
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">{children}</CollapsibleContent>
		</Collapsible>
	);
}

function MapDetails({ entry }: { entry: ReasoningReadingMapEntry }) {
	return (
		<div className="space-y-1">
			<p>
				<span lang="fr">{entry.title}</span> ·{" "}
				{m.reasoning_page_range({
					start: reasoningNumber(entry.page_start),
					end: reasoningNumber(entry.page_end),
				})}
			</p>
			<p>
				{m.reasoning_map_details({
					read: reasoningNumber(entry.pages_read),
					total: reasoningNumber(entry.pages),
					percent: reasoningPercent(entry.share_read),
				})}
			</p>
		</div>
	);
}

function ReadingMap({
	section,
	pdfUrl,
	kpis,
}: {
	section: ReasoningReadingMapSection;
	pdfUrl: string | null;
	kpis?: ReasoningKpisSection;
}) {
	const [active, setActive] = useState<ReasoningReadingMapEntry | null>(null);
	const entries = section.data.sections;
	const total = entries.reduce(
		(sum, entry) => sum + Math.max(0, entry.pages),
		0,
	);
	const weight = (entry: ReasoningReadingMapEntry) =>
		total > 0
			? Math.max(0, entry.pages) / total
			: 1 / Math.max(1, entries.length);
	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
				<h1 className="font-heading text-2xl text-balance">
					{m.reasoning_map_title()}
				</h1>
				<p className="font-mono text-xs text-muted-foreground">
					{reasoningMapSubtitle(section, kpis)} ·{" "}
					{section.data.granularity === "chapitres"
						? m.reasoning_granularity_chapters()
						: m.reasoning_granularity_subsections()}
				</p>
			</div>
			{entries.length === 0 ? (
				<EmptyItems />
			) : (
				<div>
					<ul data-reasoning-map className="mt-4 flex h-28 border bg-muted">
						{entries.map((entry) => {
							const enabled = pdfUrl !== null && validPdfPage(entry.pdf_page);
							const segmentClass = `relative block h-full w-full hover:z-10 hover:outline-2 hover:-outline-offset-2 hover:outline-ring focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`;
							const fill = (
								<span
									aria-hidden="true"
									className="absolute inset-x-0 bottom-0 mx-auto w-[88%] bg-primary"
									style={{ height: `${share(entry.share_read) * 100}%` }}
								/>
							);
							return (
								<li
									key={`${entry.page_start}-${entry.title}`}
									className="min-w-0 border-e last:border-e-0"
									style={{ flexGrow: weight(entry), flexBasis: 0 }}
								>
									<Tooltip>
										<TooltipTrigger
											render={
												enabled ? (
													// biome-ignore lint/a11y/useAnchorContent: TooltipTrigger adds the fill and keeps the accessible label.
													<a
														href={pdfPageUrl(pdfUrl, entry.pdf_page)}
														target="_blank"
														rel="noopener noreferrer"
														aria-label={entry.title}
													/>
												) : (
													<button type="button" />
												)
											}
											className={segmentClass}
											aria-label={m.reasoning_map_accessible_label({
												title: entry.title,
												read: reasoningNumber(entry.pages_read),
												total: reasoningNumber(entry.pages),
											})}
											onMouseEnter={() => setActive(entry)}
											onMouseLeave={() => setActive(null)}
											onFocus={() => setActive(entry)}
											onBlur={() => setActive(null)}
										>
											{fill}
										</TooltipTrigger>
										<TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))] wrap-break-words">
											<MapDetails entry={entry} />
										</TooltipContent>
									</Tooltip>
								</li>
							);
						})}
					</ul>
					<div
						aria-hidden="true"
						className="flex pt-1 font-mono text-xs text-muted-foreground"
					>
						{entries.map((entry) => (
							<span
								key={`${entry.page_start}-${entry.title}`}
								className="min-w-0 overflow-hidden text-center"
								style={{ flexGrow: weight(entry), flexBasis: 0 }}
							>
								{entry.tick_label}
							</span>
						))}
					</div>
				</div>
			)}
			<div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
				<div className="flex flex-wrap gap-4">
					<span>
						<span
							aria-hidden="true"
							className="me-1.5 inline-block size-2.5 bg-primary"
						/>
						{m.reasoning_legend_read()}
					</span>
					<span>
						<span
							aria-hidden="true"
							className="me-1.5 inline-block size-2.5 border bg-muted"
						/>
						{m.reasoning_legend_unread()}
					</span>
				</div>
				<p className="font-mono">{m.reasoning_map_hint()}</p>
			</div>
			<p className="font-mono text-xs text-muted-foreground">
				{m.reasoning_legend_hint()}
			</p>
			<div
				aria-live="polite"
				aria-atomic="true"
				className="min-h-10 font-mono text-xs"
			>
				{active && <MapDetails entry={active} />}
			</div>
		</section>
	);
}

function ReadingLists({
	mostRead,
	neverOpened,
	pdfUrl,
}: {
	mostRead?: ReasoningMostReadSection;
	neverOpened?: ReasoningNeverOpenedSection;
	pdfUrl: string | null;
}) {
	return (
		<div className="grid gap-5 min-[860px]:grid-cols-2">
			{mostRead && (
				<Card>
					<CardHeader>
						<h2 className={labelClass}>{m.reasoning_most_read_title()}</h2>
					</CardHeader>
					<CardContent>
						{mostRead.data.items.length === 0 ? (
							<EmptyItems />
						) : (
							<ol className="space-y-2">
								{mostRead.data.items.map((item) => (
									<li key={item.title} className="flex justify-between gap-3">
										<span lang="fr">{item.title}</span>
										<span className="shrink-0 font-mono text-xs text-primary tabular-nums">
											{m.reasoning_most_read_value({
												percent: reasoningPercent(item.share_read),
												pages: reasoningNumber(item.pages_read),
											})}
										</span>
									</li>
								))}
							</ol>
						)}
					</CardContent>
				</Card>
			)}
			{neverOpened && (
				<Card>
					<CardHeader>
						<h2 className={labelClass}>
							{neverOpened.data.count === 1
								? m.reasoning_never_opened_title_single({
										count: reasoningNumber(neverOpened.data.count),
									})
								: m.reasoning_never_opened_title({
										count: reasoningNumber(neverOpened.data.count),
									})}
						</h2>
					</CardHeader>
					<CardContent>
						{neverOpened.data.items.length === 0 ? (
							<p className="text-muted-foreground">
								{m.reasoning_all_opened()}
							</p>
						) : (
							<ul className="space-y-2">
								{neverOpened.data.items.map((item) => (
									<li key={item.title}>
										<PageLink pdfUrl={pdfUrl} page={item.pdf_page}>
											<span>
												<span lang="fr">{item.title}</span> ·{" "}
												{m.reasoning_page({
													page: reasoningNumber(item.page_start),
												})}
											</span>
										</PageLink>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Kpis({ section }: { section: ReasoningKpisSection }) {
	return (
		<section>
			<h2 className="sr-only">{m.reasoning_kpis_title()}</h2>
			<Card>
				{section.data.items.length === 0 ? (
					<CardContent className="pt-5">
						<EmptyItems />
					</CardContent>
				) : (
					<dl className="grid grid-cols-2 min-[860px]:grid-cols-4">
						{section.data.items.map((item) => (
							<div
								key={item.key}
								className="flex flex-col border-e p-5 even:border-e-0 min-[860px]:even:border-e min-[860px]:last:border-e-0"
							>
								<dt className="order-2 mt-2 text-muted-foreground">
									{reasoningKpi(item).caption}
								</dt>
								<dd className="font-mono text-3xl font-semibold tabular-nums">
									{reasoningKpi(item).value}
								</dd>
							</div>
						))}
					</dl>
				)}
			</Card>
		</section>
	);
}

function Part({
	label,
	feedback = false,
	children,
}: {
	label: string;
	feedback?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"space-y-2 border-s-3 bg-muted/60 px-4 py-3",
				feedback ? "border-primary" : "border-ring",
			)}
		>
			<h4 className={labelClass}>{label}</h4>
			{children}
		</div>
	);
}

function GestureDetails({
	item,
	pdfUrl,
}: {
	item: ReasoningIteration;
	pdfUrl: string | null;
}) {
	return (
		<>
			{item.gesture.readings.length > 0 && (
				<div>
					<h4 className="mb-2 font-medium">{m.reasoning_readings()}</h4>
					<ul className="space-y-2">
						{item.gesture.readings.map((reading, index) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Repeated readings keep their source order.
								key={`${reading.type}-${index}`}
							>
								{reading.type === "page_jump" ? (
									<PageLink pdfUrl={pdfUrl} page={reading.pdf_page}>
										<span>
											<span lang="fr">{reading.section_title}</span> ·{" "}
											{m.reasoning_page({
												page: reasoningNumber(reading.page),
											})}
										</span>
									</PageLink>
								) : (
									<>
										{m.reasoning_phrase_search()} ·{" "}
										<q lang="fr">{reading.text}</q>
									</>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			{item.gesture.drafts.length > 0 && (
				<div className="mt-3">
					<h4 className="mb-2 font-medium">{m.reasoning_drafts()}</h4>
					<ul className="flex flex-wrap gap-2">
						{item.gesture.drafts.map((draft) => (
							<li key={draft.variable}>
								<Badge variant="outline">
									<code>{draft.variable}</code> · {reasoningWords(draft.words)}
								</Badge>
							</li>
						))}
					</ul>
				</div>
			)}
		</>
	);
}

export function IterationContent({
	item,
	pdfUrl,
}: {
	item: ReasoningIteration;
	pdfUrl: string | null;
}) {
	return (
		<div className="space-y-3">
			<Part label={m.reasoning_intention()}>
				<p
					lang={item.intention.language}
					className="max-w-prose whitespace-pre-wrap font-heading text-base leading-relaxed"
				>
					{item.intention.headline}
				</p>
				<p className="font-mono text-xs text-muted-foreground">
					{item.intention.language === "fr"
						? m.reasoning_language_fr()
						: m.reasoning_language_en()}
				</p>
				{item.intention.full.length > item.intention.headline.length + 2 && (
					<Disclosure label={m.reasoning_full_intention()}>
						<p
							lang={item.intention.language}
							className="max-w-prose whitespace-pre-wrap"
						>
							{item.intention.full}
						</p>
					</Disclosure>
				)}
			</Part>
			<Part label={m.reasoning_gesture()}>
				<p className="max-w-prose whitespace-pre-wrap">
					{reasoningGesture(item)}
				</p>
				{(item.gesture.readings.length > 0 ||
					item.gesture.drafts.length > 0) && (
					<Disclosure label={m.reasoning_gesture_details()}>
						<GestureDetails item={item} pdfUrl={pdfUrl} />
					</Disclosure>
				)}
				{item.gesture.code.trim() && (
					<Disclosure label={m.reasoning_code()}>
						<pre
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the code.
							tabIndex={0}
							className={`max-h-80 overflow-auto border bg-card p-3 font-mono text-xs leading-relaxed ${focusClass}`}
						>
							<code>{item.gesture.code}</code>
						</pre>
					</Disclosure>
				)}
			</Part>
			<Part label={m.reasoning_feedback()} feedback>
				{item.feedback.error !== null && (
					<div className="text-destructive">
						<p className="font-medium">{m.reasoning_error()}</p>
						<pre className="mt-1 whitespace-pre-wrap font-mono text-xs wrap-break-words">
							<code>{item.feedback.error}</code>
						</pre>
					</div>
				)}
				{item.feedback.extracts.length > 0 && (
					<ul className="flex flex-wrap gap-2">
						{item.feedback.extracts.map((extract) => (
							<li
								key={`${extract.pdf_page}-${extract.page_end}-${extract.label}`}
							>
								<Badge variant="outline" className="text-primary">
									<PageLink pdfUrl={pdfUrl} page={extract.pdf_page}>
										{m.reasoning_page_range({
											start: reasoningNumber(extract.page_start),
											end: reasoningNumber(extract.page_end),
										})}
									</PageLink>
								</Badge>
							</li>
						))}
					</ul>
				)}
				{item.feedback.extracts.length === 0 && (
					<p className="text-muted-foreground">
						{reasoningEmptyFeedback(item.kind)}
					</p>
				)}
			</Part>
		</div>
	);
}

function DurationPanel({
	section,
	selected,
	items,
	cardId,
	onSelect,
}: {
	section: ReasoningIterationBarsSection;
	selected: number | null;
	items: ReasoningIteration[];
	cardId: (number: number) => string;
	onSelect: (number: number) => void;
}) {
	return (
		<aside className="min-w-0 min-[860px]:sticky min-[860px]:top-24">
			<h2 className={`mb-2 ${labelClass}`}>
				{section.data.items.length === 1
					? m.reasoning_duration_title_single({
							count: reasoningNumber(section.data.items.length),
						})
					: m.reasoning_duration_title({
							count: reasoningNumber(section.data.items.length),
						})}
			</h2>
			<Card className="p-4">
				{section.data.items.length === 0 ? (
					<EmptyItems />
				) : (
					<ol className="space-y-1">
						{section.data.items.map((bar) => {
							const enabled = items.some((item) => item.n === bar.n);
							return (
								<li key={bar.n}>
									<Button
										data-reasoning-duration
										data-iteration-number={bar.n}
										data-selected={selected === bar.n}
										variant="ghost"
										disabled={!enabled}
										aria-pressed={selected === bar.n}
										aria-controls={enabled ? cardId(bar.n) : undefined}
										aria-label={m.reasoning_iteration_bar_label({
											number: reasoningNumber(bar.n),
											kind: reasoningKind(bar.kind),
											seconds: reasoningSeconds(bar.seconds),
										})}
										onClick={() => onSelect(bar.n)}
										className={cn(
											"grid h-auto min-h-9 w-full grid-cols-[2ch_minmax(0,1fr)] gap-2 px-1 text-start font-mono text-xs",
											selected === bar.n && "bg-accent ring-1 ring-ring",
										)}
									>
										<span
											className={cn(
												"tabular-nums",
												selected !== bar.n && "text-muted-foreground",
											)}
										>
											{reasoningNumber(bar.n)}
										</span>
										<span className="flex min-w-0 flex-wrap items-center gap-2 whitespace-normal">
											<span aria-hidden="true" className="w-20 shrink-0">
												<span
													className={cn(
														"block h-2",
														selected === bar.n ? "bg-primary" : "bg-primary/40",
													)}
													style={{
														width: `${share(section.data.max_seconds > 0 ? bar.seconds / section.data.max_seconds : 0) * 100}%`,
													}}
												/>
											</span>
											<span className="text-muted-foreground tabular-nums">
												{m.generation_duration({
													seconds: reasoningSeconds(bar.seconds),
												})}
											</span>
											<span className="ms-auto text-muted-foreground">
												{reasoningKind(bar.kind)}
											</span>
										</span>
									</Button>
								</li>
							);
						})}
					</ol>
				)}
			</Card>
			<p className="mt-3 text-xs text-muted-foreground">
				{m.reasoning_bars_caption()}
			</p>
		</aside>
	);
}

function ReasoningLayout({
	reasoning,
	title,
	pdfUrl,
}: ReasoningContentProps & { reasoning: Reasoning }) {
	const id = useId();
	const headers = useRef(new Map<number, HTMLHeadingElement>());
	const sections = reasoning.sections;
	const map = sections.find((section) => section.id === "reading_map");
	const mostRead = sections.find((section) => section.id === "most_read");
	const neverOpened = sections.find((section) => section.id === "never_opened");
	const kpis = sections.find((section) => section.id === "kpis");
	const iterations = sections.find((section) => section.id === "iterations");
	const bars = sections.find((section) => section.id === "iteration_bars");
	const items = iterations?.data.items ?? [];
	const [selected, setSelected] = useState<number | null>(items[0]?.n ?? null);
	const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

	useEffect(() => {
		const cards = items.flatMap((item) => {
			const card = headers.current
				.get(item.n)
				?.closest<HTMLElement>("[data-slot=card]");
			return card ? [{ number: item.n, element: card }] : [];
		});
		const firstCard = cards[0];
		if (!firstCard) return;

		let frame: number | null = null;
		function updateSelection() {
			frame = null;
			const top = Number.parseFloat(
				window.getComputedStyle(firstCard.element).scrollMarginTop,
			);
			const readingTop = Math.max(
				Number.isFinite(top) ? top : 0,
				window.innerHeight / 3,
			);
			let foremost = firstCard.number;
			for (const card of cards) {
				foremost = card.number;
				if (card.element.getBoundingClientRect().bottom > readingTop) break;
			}
			setSelected(foremost);
		}

		function scheduleSelection() {
			if (frame === null) frame = window.requestAnimationFrame(updateSelection);
		}

		updateSelection();
		const observer = new ResizeObserver(scheduleSelection);
		for (const card of cards) observer.observe(card.element);
		window.addEventListener("scroll", scheduleSelection, { passive: true });
		window.addEventListener("resize", scheduleSelection);
		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", scheduleSelection);
			window.removeEventListener("resize", scheduleSelection);
			if (frame !== null) window.cancelAnimationFrame(frame);
		};
	}, [items]);
	const cardId = (number: number) => `${id}-iteration-${number}`;

	function selectIteration(number: number) {
		const header = headers.current.get(number);
		if (!header) return;
		setCollapsed((previous) => ({ ...previous, [number]: false }));
		setSelected(number);
		header.focus({ preventScroll: true });
		header.closest("[data-slot=card]")?.scrollIntoView({
			block: "start",
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "instant"
				: "smooth",
		});
	}

	return (
		<article className="w-full min-w-0 space-y-6 font-sans text-sm leading-relaxed wrap-break-words pt-14">
			<p className="sr-only">{title}</p>
			{map && <ReadingMap section={map} pdfUrl={pdfUrl} kpis={kpis} />}
			{(mostRead || neverOpened) && (
				<ReadingLists
					mostRead={mostRead}
					neverOpened={neverOpened}
					pdfUrl={pdfUrl}
				/>
			)}
			{kpis && <Kpis section={kpis} />}
			{(iterations || bars) && (
				<div
					data-reasoning-timeline
					className={cn(
						"grid items-start gap-6",
						bars && iterations && "min-[860px]:grid-cols-[minmax(0,1fr)_340px]",
					)}
				>
					{iterations && (
						<section className="min-w-0 space-y-4">
							<h2 className="sr-only">{m.reasoning_iterations_title()}</h2>
							{items.length === 0 && <EmptyItems />}
							{items.map((item) => (
								<ReasoningIterationCard
									key={item.n}
									id={cardId(item.n)}
									item={item}
									pdfUrl={pdfUrl}
									selected={selected === item.n}
									open={!collapsed[item.n]}
									onOpenChange={(open) =>
										setCollapsed((previous) => ({
											...previous,
											[item.n]: !open,
										}))
									}
									headingRef={(node) => {
										if (node) headers.current.set(item.n, node);
										else headers.current.delete(item.n);
									}}
								/>
							))}
						</section>
					)}
					{bars && (
						<DurationPanel
							section={bars}
							selected={selected}
							items={items}
							cardId={cardId}
							onSelect={selectIteration}
						/>
					)}
				</div>
			)}
		</article>
	);
}

export function ReasoningContent(props: ReasoningContentProps) {
	if (
		!props.reasoning ||
		props.reasoning.sections.every((section) => section.id === "header")
	) {
		return (
			<article className="w-full text-sm">
				<h1 className="sr-only">{props.title}</h1>
				<p className="py-10 text-center text-muted-foreground">
					{m.reasoning_empty()}
				</p>
			</article>
		);
	}
	return (
		<ReasoningLayout
			key={`${props.reasoning.source.thesis_id}-${props.reasoning.source.run_id}`}
			{...props}
			reasoning={props.reasoning}
			pdfUrl={safePdfUrl(props.pdfUrl)}
		/>
	);
}

export function ReasoningIterationCard({
	item,
	pdfUrl,
	id,
	selected = false,
	headingRef,
	open,
	onOpenChange,
}: {
	item: ReasoningIteration;
	pdfUrl: string | null;
	id?: string;
	selected?: boolean;
	headingRef?: Ref<HTMLHeadingElement>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	return (
		<Card
			id={id}
			data-reasoning-iteration
			data-iteration-number={item.n}
			data-selected={selected}
			className={cn(
				"min-w-0 scroll-mt-24 text-sm leading-relaxed wrap-break-words motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150",
				selected && "border-primary ring-1 ring-primary",
			)}
		>
			<Collapsible defaultOpen open={open} onOpenChange={onOpenChange}>
				<CardHeader className="p-0">
					<h3
						tabIndex={-1}
						ref={headingRef}
						className={`${labelClass} text-foreground ${focusClass}`}
					>
						<CollapsibleTrigger
							className={`group flex min-h-11 w-full items-center gap-3 rounded-lg px-5 py-4 text-start hover:bg-muted/50 ${focusClass}`}
						>
							<span className="min-w-0 flex-1">
								{m.reasoning_iteration_header({
									number: reasoningNumber(item.n),
									seconds: reasoningSeconds(item.seconds),
								})}
							</span>
							<Badge variant="secondary" className="shrink-0 normal-case">
								{reasoningKind(item.kind)}
							</Badge>
							<ChevronRight
								aria-hidden="true"
								className="size-4 shrink-0 group-data-[panel-open]:rotate-90"
							/>
						</CollapsibleTrigger>
					</h3>
				</CardHeader>
				<CollapsibleContent keepMounted>
					<CardContent>
						<IterationContent item={item} pdfUrl={pdfUrl} />
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
