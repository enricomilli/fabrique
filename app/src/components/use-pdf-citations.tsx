import { useMemo } from "react";
import type { Components, Options } from "react-markdown";
import {
	remarkPageCitations,
	safePdfUrl,
	validPdfPage,
} from "#/lib/page-citations";
import { m } from "#/paraglide/messages";

export function usePdfCitations(pdfUrl: string | null | undefined) {
	const url = safePdfUrl(pdfUrl);
	const plugins = useMemo<Options["remarkPlugins"]>(
		() => [[remarkPageCitations, { pdfUrl: url }]],
		[url],
	);
	const components = useMemo<Components>(
		() => ({
			a: ({ node, children, ...props }) => {
				const citedPage = Number(node?.properties["data-pdf-page"]);
				const isCitation = url !== null && validPdfPage(citedPage);
				const linkUrl = props.href ?? "";
				const isPdfLink =
					isCitation ||
					(url !== null && linkUrl.split("#")[0] === url.split("#")[0]) ||
					linkUrl.startsWith("/api/pdfs/") ||
					/\.pdf(?:[?#]|$)/i.test(linkUrl);
				return (
					<a
						{...props}
						href={props.href}
						target={isPdfLink ? "_blank" : props.target}
						rel={isPdfLink ? "noopener noreferrer" : props.rel}
						data-pdf-page={isCitation ? citedPage : undefined}
						aria-label={
							isCitation
								? m.pdf_citation({ page: citedPage })
								: props["aria-label"]
						}
					>
						{children}
					</a>
				);
			},
		}),
		[url],
	);
	return { plugins, components };
}
