import { DocumentContent } from "#/components/document-content";
import { usePdfCitations } from "#/components/use-pdf-citations";

export function NoteContent({
	markdown,
	pdfUrl,
	title,
}: {
	markdown: string;
	pdfUrl?: string | null;
	title: string;
}) {
	const { isOpen, plugins, components, sidebar } = usePdfCitations(
		pdfUrl,
		"note-pdf-open",
	);
	return (
		<div className={`note-reader ${isOpen ? "note-reader-pdf" : ""}`}>
			<div className="note-content mx-auto flow-root w-full min-w-0 max-w-[53rem]">
				<h1 className="mt-10 text-balance text-center wrap-break-words font-heading text-xl leading-relaxed sm:text-2xl">
					{title}
				</h1>
				<DocumentContent
					markdown={markdown}
					remarkPlugins={plugins}
					components={components}
				/>
			</div>
			{sidebar}
		</div>
	);
}
