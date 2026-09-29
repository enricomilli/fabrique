import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { buttonVariants } from "#/components/ui/button";
import { validPdfPage } from "#/lib/page-citations";
import { m } from "#/paraglide/messages";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

export default function PdfPageViewer({
	url,
	page,
	onPageChange,
}: {
	url: string;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const [count, setCount] = useState<number>();
	const [protectedPdf, setProtectedPdf] = useState(false);
	const [width, setWidth] = useState(0);
	const container = useRef<HTMLDivElement>(null);
	const viewport = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = container.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.floor(entry.contentRect.width)),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (page) viewport.current?.scrollTo({ top: 0, behavior: "instant" });
	}, [page]);
	const loading = (
		<output className="block p-4 text-sm">{m.pdf_loading()}</output>
	);
	const error = (
		<p role="alert" className="p-4 text-sm">
			{m.pdf_error()}
		</p>
	);
	return (
		<>
			<div
				ref={viewport}
				className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted p-2"
			>
				<div ref={container} className="min-w-0">
					{protectedPdf ? (
						error
					) : (
						<Document
							file={url}
							suspense={false}
							loading={loading}
							error={error}
							onPassword={() => setProtectedPdf(true)}
							onLoadSuccess={({ numPages }) => setCount(numPages)}
						>
							{count && !validPdfPage(page, count) ? (
								<p role="alert" className="p-4 text-sm">
									{m.pdf_page_error({ page })}
								</p>
							) : width > 0 && count ? (
								<Page
									key={page}
									pageNumber={page}
									width={width}
									renderTextLayer
									renderAnnotationLayer={false}
									loading={loading}
									error={error}
								/>
							) : (
								loading
							)}
						</Document>
					)}
				</div>
			</div>
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
				<button
					type="button"
					className={buttonVariants({ variant: "ghost", className: "min-h-11" })}
					disabled={!count || page <= 1}
					onClick={() => onPageChange(Math.min(page - 1, count ?? 1))}
				>
					<ArrowLeftIcon aria-hidden="true" className="size-4" />
					{m.pdf_previous()}
				</button>
				<output className="tabular-nums">
					{count ? m.pdf_page_status({ page, count }) : m.pdf_loading()}
				</output>
				<button
					type="button"
					className={buttonVariants({ variant: "ghost", className: "min-h-11" })}
					disabled={!count || page >= count}
					onClick={() => onPageChange(page + 1)}
				>
					{m.pdf_next()}
					<ArrowRightIcon aria-hidden="true" className="size-4" />
				</button>
			</div>
		</>
	);
}
