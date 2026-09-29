import type { Link, Nodes, Parent, PhrasingContent, Root } from "mdast";

export function safePdfUrl(value: string | null | undefined): string | null {
	if (!value || /[\s\\]/.test(value)) return null;
	if (/^\/api\/pdfs\/[A-Za-z0-9._%-]+$/.test(value)) return value;
	try {
		const url = new URL(value);
		return ["https:", "http:"].includes(url.protocol) ? value : null;
	} catch {
		return null;
	}
}

export function pdfPageUrl(url: string, page: number): string {
	return `${url.split("#")[0]}#page=${page}`;
}

export function validPdfPage(page: number, count?: number): boolean {
	return (
		Number.isSafeInteger(page) &&
		page > 0 &&
		(count === undefined || page <= count)
	);
}

function citationNodes(value: string, url: string): PhrasingContent[] {
	const nodes: PhrasingContent[] = [];
	const pattern =
		/\(p\.\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*\s*\)/g;
	let offset = 0;
	for (const match of value.matchAll(pattern)) {
		const start = match.index;
		nodes.push({ type: "text", value: value.slice(offset, start) });
		let innerOffset = 0;
		for (const item of match[0].matchAll(/\d+(?:\s*[-–]\s*\d+)?/g)) {
			nodes.push({
				type: "text",
				value: match[0].slice(innerOffset, item.index),
			});
			const bounds = item[0].split(/[-–]/).map(Number);
			const page = bounds[0];
			if (
				bounds.every((bound) => validPdfPage(bound)) &&
				(bounds[1] ?? page) >= page
			) {
				const link: Link = {
					type: "link",
					url: pdfPageUrl(url, page),
					data: { hProperties: { "data-pdf-page": page } },
					children: [{ type: "text", value: item[0] }],
				};
				nodes.push(link);
			} else nodes.push({ type: "text", value: item[0] });
			innerOffset = item.index + item[0].length;
		}
		nodes.push({ type: "text", value: match[0].slice(innerOffset) });
		offset = start + match[0].length;
	}
	nodes.push({ type: "text", value: value.slice(offset) });
	return nodes;
}

export function remarkPageCitations({
	pdfUrl,
}: {
	pdfUrl?: string | null;
} = {}) {
	const url = safePdfUrl(pdfUrl);
	return (tree: Root): void => {
		if (!url) return;
		function walk(node: Nodes, pdfUrl: string): void {
			if (
				["link", "linkReference", "code", "inlineCode", "html"].includes(
					node.type,
				)
			)
				return;
			if (!("children" in node)) return;
			// Raw inline HTML can enclose text siblings. Leave that text container unchanged.
			if (
				["paragraph", "heading", "emphasis", "strong", "delete"].includes(
					node.type,
				) &&
				node.children.some((child) => child.type === "html")
			)
				return;
			const parent: Parent = node;
			parent.children = parent.children.flatMap<Parent["children"][number]>(
				(child) => {
					if (child.type === "text") return citationNodes(child.value, pdfUrl);
					walk(child, pdfUrl);
					return [child];
				},
			);
		}
		walk(tree, url);
	};
}
