import type { Element, Root as HastRoot } from "hast";
import type { Heading, Root } from "mdast";
import { toString as headingText } from "mdast-util-to-string";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
export type FicheHeading = {
	id: string;
	label: string;
};

const parser = unified().use(remarkParse).use(remarkMath);

function collectHeadings(
	tree: Root,
): { node: Heading; heading: FicheHeading }[] {
	const usedIds = new Set<string>();
	return tree.children.flatMap((node) => {
		if (node.type !== "heading" || node.depth !== 2) return [];
		const label = headingText(node);
		const slug = label
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-|-$/g, "");
		const base = `fiche-${slug || "section"}`;
		let id = base;
		let suffix = 2;
		while (usedIds.has(id)) id = `${base}-${suffix++}`;
		usedIds.add(id);
		return [{ node, heading: { id, label } }];
	});
}

export function extractFicheHeadings(markdown: string): FicheHeading[] {
	return collectHeadings(parser.parse(markdown)).map(({ heading }) => heading);
}

// Use the same AST rules for the contents and the rendered heading IDs.
export function remarkFicheAnchors() {
	return (tree: Root): void => {
		for (const { node, heading } of collectHeadings(tree)) {
			node.data = {
				...node.data,
				hProperties: {
					...node.data?.hProperties,
					id: heading.id,
					tabIndex: -1,
				},
			};
		}
	};
}

export function currentFicheHeading(
	headings: readonly { id: string; top: number }[],
	offset: number,
	atBottom: boolean,
): string | null {
	if (atBottom) return headings.at(-1)?.id ?? null;
	let current = headings[0]?.id ?? null;
	for (const heading of headings) {
		if (heading.top > offset) break;
		current = heading.id;
	}
	return current;
}

// Group after Markdown resolves references across the complete document.
export function rehypeFicheSections() {
	return (tree: HastRoot): void => {
		const children: HastRoot["children"] = [];
		let section: Element | undefined;
		for (const node of tree.children) {
			if (node.type === "element" && node.tagName === "h2") {
				section = {
					type: "element",
					tagName: "section",
					properties: { className: ["fiche-section"] },
					children: [],
				};
				children.push(section);
			}
			if (section && node.type !== "doctype") {
				section.children.push(node);
			} else {
				children.push(node);
			}
		}
		tree.children = children;
	};
}

export function extractFicheTitle(markdown: string): string | null {
	const title = parser
		.parse(markdown)
		.children.find((node) => node.type === "heading" && node.depth === 1);
	return title ? headingText(title) : null;
}

export function remarkRemoveFicheTitle() {
	return (tree: Root): void => {
		const index = tree.children.findIndex(
			(node) => node.type === "heading" && node.depth === 1,
		);
		if (index !== -1) tree.children.splice(index, 1);
	};
}
