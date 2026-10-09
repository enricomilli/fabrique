import type {
	ReasoningIteration,
	ReasoningIterationKind,
	ReasoningKpi,
	ReasoningKpisSection,
	ReasoningReadingMapSection,
} from "#/lib/reasoning.schema";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export function reasoningNumber(value: number): string {
	return new Intl.NumberFormat(getLocale()).format(value);
}

export function reasoningSeconds(value: number): string {
	return new Intl.NumberFormat(getLocale(), {
		maximumFractionDigits: 1,
	}).format(value);
}

export function reasoningPercent(value: number): string {
	return new Intl.NumberFormat(getLocale(), {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
}

export function reasoningKind(kind: ReasoningIterationKind): string {
	switch (kind) {
		case "lecture":
			return m.reasoning_kind_reading();
		case "rédaction":
			return m.reasoning_kind_writing();
		case "assemblage":
			return m.reasoning_kind_assembly();
	}
}

export function reasoningWords(count: number): string {
	const inputs = { count: reasoningNumber(count) };
	return count === 1
		? m.reasoning_word_single(inputs)
		: m.reasoning_words(inputs);
}

export function reasoningGesture(item: ReasoningIteration): string {
	if (item.kind === "assemblage") return m.reasoning_summary_assembly();
	if (item.kind === "rédaction") {
		if (item.gesture.drafts.length === 0) return m.reasoning_summary_repl();
		const drafts = item.gesture.drafts.map((draft) =>
			m.reasoning_summary_draft({
				variable: draft.variable,
				words: reasoningWords(draft.words),
			}),
		);
		return m.reasoning_summary_writing({
			drafts: new Intl.ListFormat(getLocale()).format(drafts),
		});
	}
	const passages = item.gesture.readings.map((reading) =>
		reading.type === "page_jump"
			? m.reasoning_summary_page({
					title: reading.section_title,
					page: reasoningNumber(reading.page),
				})
			: m.reasoning_summary_search({ text: reading.text }),
	);
	const inputs = {
		count: reasoningNumber(passages.length),
		passages: new Intl.ListFormat(getLocale()).format(passages),
	};
	return passages.length === 1
		? m.reasoning_summary_reading_single(inputs)
		: m.reasoning_summary_reading(inputs);
}

export function reasoningEmptyFeedback(kind: ReasoningIterationKind): string {
	switch (kind) {
		case "assemblage":
			return m.reasoning_feedback_assembly();
		case "rédaction":
			return m.reasoning_feedback_writing();
		case "lecture":
			return m.reasoning_feedback_no_extract();
	}
}

export function reasoningMapSubtitle(
	section: ReasoningReadingMapSection,
	kpis?: ReasoningKpisSection,
): string {
	const pages = kpis?.data.items.find((item) => item.key === "pages")?.raw;
	const entries = section.data.sections;
	const inputs = {
		count: reasoningNumber(entries.length),
		read: reasoningNumber(
			pages?.consulted ??
				entries.reduce((sum, entry) => sum + entry.pages_read, 0),
		),
		total: reasoningNumber(
			pages?.total ?? entries.reduce((sum, entry) => sum + entry.pages, 0),
		),
	};
	return entries.length === 1
		? m.reasoning_map_subtitle_single(inputs)
		: m.reasoning_map_subtitle(inputs);
}

export function reasoningKpi(item: ReasoningKpi): {
	value: string;
	caption: string;
} {
	switch (item.key) {
		case "pages":
			return {
				value: m.reasoning_ratio({
					count: reasoningNumber(item.raw.consulted),
					total: reasoningNumber(item.raw.total),
				}),
				caption: m.reasoning_kpi_pages(),
			};
		case "sections":
			return {
				value: m.reasoning_ratio({
					count: reasoningNumber(item.raw.touched),
					total: reasoningNumber(item.raw.total),
				}),
				caption: m.reasoning_kpi_sections(),
			};
		case "extracts": {
			const inputs = { count: reasoningNumber(item.raw.citations_in_note) };
			return {
				value: reasoningNumber(item.raw.extracts),
				caption:
					item.raw.citations_in_note === 1
						? m.reasoning_kpi_extracts_single(inputs)
						: m.reasoning_kpi_extracts(inputs),
			};
		}
		case "iterations":
			return {
				value: reasoningNumber(item.raw.iterations),
				caption: m.reasoning_kpi_iterations({
					seconds: reasoningSeconds(item.raw.seconds),
					words: reasoningWords(item.raw.note_words),
				}),
			};
	}
}
