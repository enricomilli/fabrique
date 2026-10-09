import { z } from "zod";

export const reasoningSourceSchema = z.object({
	thesis_id: z.string(),
	run_id: z.string(),
	pdf_file: z.string(),
	pdf_page_offset: z.int(),
	generator: z.string(),
});

const reasoningSectionBaseSchema = z.object({
	ui_label: z.string(),
	shows: z.string(),
});

export const reasoningHeaderSectionSchema = reasoningSectionBaseSchema.extend({
	id: z.literal("header"),
	fields: z.object({
		doc_label: z.string(),
		tabs: z.string(),
	}),
	data: z.object({
		author: z.string(),
		brand: z.string(),
		doc_label: z.string(),
		title: z.string(),
		year: z.string(),
		tabs: z.array(
			z.object({
				active: z.boolean(),
				label: z.string(),
			}),
		),
	}),
});

export const reasoningReadingMapEntrySchema = z.object({
	is_content: z.boolean(),
	level: z.int(),
	page_end: z.int(),
	page_start: z.int(),
	pages: z.int(),
	pages_read: z.int(),
	pdf_page: z.int(),
	share_read: z.number(),
	tick_label: z.string().nullable(),
	title: z.string(),
});

export const reasoningReadingMapSectionSchema =
	reasoningSectionBaseSchema.extend({
		id: z.literal("reading_map"),
		fields: z.object({
			granularity: z.string(),
			"sections[].is_content": z.string(),
			"sections[].pages": z.string(),
			"sections[].pages_read": z.string(),
			"sections[].pdf_page": z.string(),
			"sections[].share_read": z.string(),
		}),
		data: z.object({
			granularity: z.enum(["chapitres", "chapitres et sous-sections"]),
			legend: z.object({
				hint: z.string(),
				read: z.string(),
				unread: z.string(),
			}),
			sections: z.array(reasoningReadingMapEntrySchema),
			subtitle: z.string(),
		}),
	});

export const reasoningMostReadSectionSchema = reasoningSectionBaseSchema.extend(
	{
		id: z.literal("most_read"),
		fields: z.object({ rule: z.string() }),
		data: z.object({
			items: z.array(
				z.object({
					display_value: z.string(),
					pages_read: z.int(),
					share_read: z.number(),
					title: z.string(),
				}),
			),
		}),
	},
);

export const reasoningNeverOpenedSectionSchema =
	reasoningSectionBaseSchema.extend({
		id: z.literal("never_opened"),
		fields: z.object({ "items[].pdf_page": z.string() }),
		data: z.object({
			count: z.int(),
			empty_message: z.string(),
			items: z.array(
				z.object({
					page_start: z.int(),
					pdf_page: z.int(),
					title: z.string(),
				}),
			),
		}),
	});

const reasoningKpiBaseSchema = z.object({
	caption: z.string(),
	value: z.string(),
});

export const reasoningKpiSchema = z.discriminatedUnion("key", [
	reasoningKpiBaseSchema.extend({
		key: z.literal("pages"),
		raw: z.object({ consulted: z.int(), total: z.int() }),
	}),
	reasoningKpiBaseSchema.extend({
		key: z.literal("sections"),
		raw: z.object({ touched: z.int(), total: z.int() }),
	}),
	reasoningKpiBaseSchema.extend({
		key: z.literal("extracts"),
		raw: z.object({ citations_in_note: z.int(), extracts: z.int() }),
	}),
	reasoningKpiBaseSchema.extend({
		key: z.literal("iterations"),
		raw: z.object({
			iterations: z.int(),
			note_words: z.int(),
			seconds: z.number(),
		}),
	}),
]);

export const reasoningKpisSectionSchema = reasoningSectionBaseSchema.extend({
	id: z.literal("kpis"),
	fields: z.object({
		"items[].caption": z.string(),
		"items[].key": z.string(),
		"items[].raw": z.string(),
		"items[].value": z.string(),
	}),
	data: z.object({ items: z.array(reasoningKpiSchema) }),
});

export const reasoningReadingSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("page_jump"),
		page: z.int(),
		pdf_page: z.int(),
		section_title: z.string(),
	}),
	z.object({
		type: z.literal("phrase_search"),
		text: z.string(),
	}),
]);

export const reasoningIterationKindSchema = z.enum([
	"lecture",
	"rédaction",
	"assemblage",
]);

export const reasoningIterationSchema = z.object({
	feedback: z.object({
		empty_message: z.string().nullable(),
		error: z.string().nullable(),
		extracts: z.array(
			z.object({
				label: z.string(),
				page_end: z.int(),
				page_start: z.int(),
				pdf_page: z.int(),
			}),
		),
	}),
	gesture: z.object({
		code: z.string(),
		drafts: z.array(
			z.object({
				variable: z.string(),
				words: z.int(),
			}),
		),
		readings: z.array(reasoningReadingSchema),
		summary: z.string(),
	}),
	header_label: z.string(),
	intention: z.object({
		full: z.string(),
		headline: z.string(),
		language: z.enum(["en", "fr"]),
		language_note: z.string(),
	}),
	kind: reasoningIterationKindSchema,
	n: z.int(),
	seconds: z.number(),
	selected_by_default: z.boolean(),
});

export const reasoningIterationsSectionSchema =
	reasoningSectionBaseSchema.extend({
		id: z.literal("iterations"),
		fields: z.object({
			"feedback.error": z.string(),
			"feedback.extracts": z.string(),
			"gesture.drafts": z.string(),
			"gesture.readings": z.string(),
			"intention.full": z.string(),
			"intention.headline": z.string(),
			"intention.language": z.string(),
			kind: z.string(),
		}),
		data: z.object({ items: z.array(reasoningIterationSchema) }),
	});

export const reasoningIterationBarsSectionSchema =
	reasoningSectionBaseSchema.extend({
		id: z.literal("iteration_bars"),
		fields: z.object({ max_seconds: z.string() }),
		data: z.object({
			caption: z.string(),
			items: z.array(
				z.object({
					kind: reasoningIterationKindSchema,
					n: z.int(),
					seconds: z.number(),
				}),
			),
			max_seconds: z.number(),
		}),
	});

export const reasoningSectionSchema = z.discriminatedUnion("id", [
	reasoningHeaderSectionSchema,
	reasoningReadingMapSectionSchema,
	reasoningMostReadSectionSchema,
	reasoningNeverOpenedSectionSchema,
	reasoningKpisSectionSchema,
	reasoningIterationsSectionSchema,
	reasoningIterationBarsSectionSchema,
]);

export const reasoningSchema = z.object({
	schema: z.literal("explorer_v2.reasoning/1"),
	about: z.string(),
	source: reasoningSourceSchema,
	sections: z.array(reasoningSectionSchema),
});

export type ReasoningSource = z.infer<typeof reasoningSourceSchema>;
export type ReasoningHeaderSection = z.infer<
	typeof reasoningHeaderSectionSchema
>;
export type ReasoningReadingMapEntry = z.infer<
	typeof reasoningReadingMapEntrySchema
>;
export type ReasoningReadingMapSection = z.infer<
	typeof reasoningReadingMapSectionSchema
>;
export type ReasoningMostReadSection = z.infer<
	typeof reasoningMostReadSectionSchema
>;
export type ReasoningNeverOpenedSection = z.infer<
	typeof reasoningNeverOpenedSectionSchema
>;
export type ReasoningKpi = z.infer<typeof reasoningKpiSchema>;
export type ReasoningKpisSection = z.infer<typeof reasoningKpisSectionSchema>;
export type ReasoningReading = z.infer<typeof reasoningReadingSchema>;
export type ReasoningIterationKind = z.infer<
	typeof reasoningIterationKindSchema
>;
export type ReasoningIteration = z.infer<typeof reasoningIterationSchema>;
export type ReasoningIterationsSection = z.infer<
	typeof reasoningIterationsSectionSchema
>;
export type ReasoningIterationBarsSection = z.infer<
	typeof reasoningIterationBarsSectionSchema
>;
export type ReasoningSection = z.infer<typeof reasoningSectionSchema>;
export type Reasoning = z.infer<typeof reasoningSchema>;
