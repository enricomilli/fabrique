import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentContent } from "#/components/document-content";
import { installFicheAutoScroll } from "#/lib/fiche-auto-scroll";
import {
	currentFicheHeading,
	extractFicheHeadings,
	extractFicheTitle,
	type FicheHeading,
	rehypeFicheSections,
	remarkFicheAnchors,
	remarkRemoveFicheTitle,
} from "#/lib/fiche-headings";
import { m } from "#/paraglide/messages";

const anchorPlugins = [remarkFicheAnchors, remarkRemoveFicheTitle];
const sectionPlugins = [rehypeFicheSections];

function ContentsLinks({
	headings,
	activeId,
}: {
	headings: readonly FicheHeading[];
	activeId: string | null;
}) {
	return (
		<ul className="space-y-1">
			{headings.map(({ id, label }) => (
				<li key={id}>
					<a
						href={`#${id}`}
						aria-current={activeId === id ? "location" : undefined}
						className={`block border-s-2 px-3 py-2 text-sm leading-6 break-words hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${activeId === id ? "border-foreground bg-muted font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
					>
						{label}
					</a>
				</li>
			))}
		</ul>
	);
}

export function FicheContent({ markdown }: { markdown: string }) {
	const headings = useMemo(() => extractFicheHeadings(markdown), [markdown]);
	const title = useMemo(() => extractFicheTitle(markdown), [markdown]);
	const contentRef = useRef<HTMLDivElement>(null);
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		const content = contentRef.current;
		if (!content || headings.length === 0) return;
		const root = document.documentElement;
		root.classList.add("fiche-reading");
		const elements = headings.flatMap(({ id }) => {
			const element = document.getElementById(id);
			return element && content.contains(element) ? [element] : [];
		});
		let frame = 0;
		const update = () => {
			frame = 0;
			const offset =
				Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
			const atBottom =
				window.scrollY > 0 &&
				window.scrollY + window.innerHeight >= root.scrollHeight - 2;
			setActiveId(
				currentFicheHeading(
					elements.map((element) => ({
						id: element.id,
						top: element.getBoundingClientRect().top,
					})),
					offset + 1,
					atBottom,
				),
			);
		};
		const scheduleUpdate = () => {
			if (!frame) frame = window.requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", scheduleUpdate, { passive: true });
		window.addEventListener("resize", scheduleUpdate);
		window.addEventListener("hashchange", scheduleUpdate);
		const observer = new ResizeObserver(scheduleUpdate);
		observer.observe(content);
		const stopAutoScroll = installFicheAutoScroll(content, elements);
		return () => {
			stopAutoScroll();
			root.classList.remove("fiche-reading");
			window.cancelAnimationFrame(frame);
			window.removeEventListener("scroll", scheduleUpdate);
			window.removeEventListener("resize", scheduleUpdate);
			window.removeEventListener("hashchange", scheduleUpdate);
			observer.disconnect();
		};
	}, [headings]);

	return (
		<div className="lg:col-span-3 lg:grid lg:grid-cols-subgrid">
			{headings.length > 0 && (
				<>
					<nav
						aria-label={m.document_contents()}
						className="mt-8 hidden w-full min-w-0 max-w-64 self-start lg:sticky lg:top-24 lg:col-start-1 lg:block"
					>
						<div className="max-h-[calc(100dvh-12rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain p-1">
							{title && (
								<h2 className="mb-4 px-3 text-sm font-medium leading-relaxed">
									{title}
								</h2>
							)}
							<ContentsLinks headings={headings} activeId={activeId} />
						</div>
					</nav>
					<details className="mt-8 snap-start border-y py-3 lg:hidden">
						<summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
							{title ?? m.document_contents()}
						</summary>
						<nav
							aria-label={m.document_contents()}
							className="mt-3 max-h-[50dvh] overflow-y-auto overscroll-contain p-1"
						>
							<ContentsLinks headings={headings} activeId={activeId} />
						</nav>
					</details>
				</>
			)}
			<div
				ref={contentRef}
				className="fiche-content mx-auto w-full min-w-0 max-w-[53rem] lg:col-start-2 [&_h2[id]:focus-visible]:outline-2 [&_h2[id]:focus-visible]:outline-offset-4 [&_h2[id]:focus-visible]:outline-ring"
			>
				<DocumentContent
					markdown={markdown}
					remarkPlugins={anchorPlugins}
					rehypePlugins={sectionPlugins}
				/>
			</div>
		</div>
	);
}
