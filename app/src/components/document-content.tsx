import Markdown from "react-markdown";
import { m } from "#/paraglide/messages";

export function DocumentContent({ markdown }: { markdown: string }) {
	if (!markdown.trim()) {
		return (
			<p className="my-10 text-center text-muted-foreground">
				{m.document_format_unavailable()}
			</p>
		);
	}
	return (
		<article className="mt-8 break-words text-base leading-8 [&_h1]:mb-6 [&_h1]:font-heading [&_h1]:text-xl [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-heading [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:font-semibold [&_p]:my-4 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-2 [&_a]:underline [&_a]:underline-offset-4 [&_hr]:my-8 [&_blockquote]:border-s-2 [&_blockquote]:ps-4 [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:p-4">
			<Markdown skipHtml>{markdown}</Markdown>
		</article>
	);
}
