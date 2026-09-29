import { ExternalLinkIcon, XIcon } from "lucide-react";
import {
	Component,
	lazy,
	Suspense,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { buttonVariants } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { pdfPageUrl } from "#/lib/page-citations";
import { m } from "#/paraglide/messages";

// The lazy module imports PDF.js only after a citation opens on the client.
const PdfPageViewer = lazy(() => import("./pdf-page-viewer"));

class PdfBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (
			<p role="alert" className="p-4 text-sm">
				{m.pdf_error()}
			</p>
		) : (
			this.props.children
		);
	}
}

export function PdfSidebar({
	url,
	page,
	onPageChange,
	onClose,
}: {
	url: string;
	page: number;
	onPageChange: (page: number) => void;
	onClose: () => void;
}) {
	const [desktop, setDesktop] = useState<boolean | null>(null);
	const [headerHeight, setHeaderHeight] = useState(57);
	const dialog = useRef<HTMLDialogElement>(null);
	const closeButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const media = window.matchMedia("(min-width: 1280px)");
		const update = () => setDesktop(media.matches);
		const header = document.querySelector("[data-app-header]");
		const updateHeaderHeight = () => {
			if (header) setHeaderHeight(header.getBoundingClientRect().height);
		};
		const observer = new ResizeObserver(updateHeaderHeight);
		if (header) observer.observe(header);
		updateHeaderHeight();
		update();
		media.addEventListener("change", update);
		return () => {
			observer.disconnect();
			media.removeEventListener("change", update);
		};
	}, []);
	useEffect(() => {
		if (desktop === null) return;
		if (!desktop) dialog.current?.showModal();
		closeButton.current?.focus({ preventScroll: true });
		if (desktop) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [desktop]);
	if (desktop === null) return null;
	const content = (
		<>
			<header className="absolute end-3 top-3 z-20 flex items-center gap-1">
				<h2 id="pdf-panel-title" className="sr-only">
					{m.pdf_panel_title()}
				</h2>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger
							render={
								<a
									href={pdfPageUrl(url, page)}
									target="_blank"
									rel="noopener noreferrer"
								/>
							}
							aria-label={m.pdf_open_source()}
							className={buttonVariants({
								variant: "ghost",
								size: "icon",
								className: "size-11 bg-background/20 backdrop-blur-md hover:bg-muted/50",
							})}
						>
							<ExternalLinkIcon aria-hidden="true" className="size-4" />
						</TooltipTrigger>
						<TooltipContent side="bottom" align="end" portalContainer={desktop ? undefined : dialog}>
							{m.pdf_open_source()}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={<button type="button" ref={closeButton} />}
							aria-label={m.pdf_close()}
							className={buttonVariants({
								variant: "ghost",
								size: "icon",
								className: "size-11 bg-background/20 backdrop-blur-md hover:bg-muted/50",
							})}
							onClick={onClose}
						>
							<XIcon aria-hidden="true" className="size-4" />
						</TooltipTrigger>
						<TooltipContent side="bottom" align="end" portalContainer={desktop ? undefined : dialog}>
							{m.pdf_close()}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</header>
			<PdfBoundary key={url}>
				<Suspense
					fallback={
						<output className="block p-4 text-sm">{m.pdf_loading()}</output>
					}
				>
					<PdfPageViewer
						key={url}
						url={url}
						page={page}
						onPageChange={onPageChange}
					/>
				</Suspense>
			</PdfBoundary>
		</>
	);
	return desktop ? (
		<aside
			aria-labelledby="pdf-panel-title"
			className="pdf-sidebar"
			style={{ top: headerHeight, height: `calc(100dvh - ${headerHeight}px)` }}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onClose();
				}
			}}
		>
			{content}
		</aside>
	) : (
		<dialog
			ref={dialog}
			aria-labelledby="pdf-panel-title"
			className="pdf-dialog"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			{content}
		</dialog>
	);
}
