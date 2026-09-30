import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Components, Options } from "react-markdown";
import { PdfSidebar } from "#/components/pdf-sidebar";
import {
	remarkPageCitations,
	safePdfUrl,
	validPdfPage,
} from "#/lib/page-citations";
import { m } from "#/paraglide/messages";

export function usePdfCitations(
	pdfUrl: string | null | undefined,
	rootClass: "fiche-pdf-open" | "note-pdf-open",
) {
	const [page, setPage] = useState<number | null>(null);
	const citationRef = useRef<HTMLAnchorElement | null>(null);
	const positionRef = useRef<number | null>(null);
	const url = safePdfUrl(pdfUrl);
	const plugins = useMemo<Options["remarkPlugins"]>(
		() => [[remarkPageCitations, { pdfUrl: url }]],
		[url],
	);
	const isOpen = page !== null;
	useLayoutEffect(() => {
		const root = document.documentElement;
		root.classList.toggle(rootClass, isOpen);
		const anchor = citationRef.current;
		const top = positionRef.current;
		if (
			anchor &&
			top !== null &&
			window.matchMedia("(min-width: 1280px)").matches
		) {
			window.scrollBy({
				top: anchor.getBoundingClientRect().top - top,
				behavior: "instant",
			});
		}
		positionRef.current = null;
		if (!isOpen) anchor?.focus({ preventScroll: true });
		return () => root.classList.remove(rootClass);
	}, [isOpen, rootClass]);
	const components = useMemo<Components>(
		() => ({
			a: ({ node, children, ...props }) => {
				const citedPage = Number(node?.properties["data-pdf-page"]);
				if (!url || !validPdfPage(citedPage))
					return <a {...props}>{children}</a>;
				return (
					<a
						{...props}
						href={props.href}
						data-pdf-page={citedPage}
						aria-label={m.pdf_citation({ page: citedPage })}
						onClick={(event) => {
							if (
								event.button !== 0 ||
								event.metaKey ||
								event.ctrlKey ||
								event.shiftKey ||
								event.altKey
							)
								return;
							event.preventDefault();
							citationRef.current = event.currentTarget;
							positionRef.current =
								event.currentTarget.getBoundingClientRect().top;
							setPage(citedPage);
						}}
					>
						{children}
					</a>
				);
			},
		}),
		[url],
	);
	return {
		isOpen,
		plugins,
		components,
		sidebar: page !== null && url && (
			<PdfSidebar
				url={url}
				page={page}
				onPageChange={setPage}
				onClose={() => {
					positionRef.current =
						citationRef.current?.getBoundingClientRect().top ?? null;
					setPage(null);
				}}
			/>
		),
	};
}
