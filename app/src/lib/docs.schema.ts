import { z } from "zod";

export const ficheMetadataSchema = z.object({
	titre: z.string().nullable(),
	auteur: z.string().nullable(),
	annee: z.string().nullable(),
	etablissement: z.string().nullable(),
	discipline: z.string().nullable(),
	mots_cles: z.array(z.string()),
	pages: z.int(),
});

export const ficheTocEntrySchema = z.object({
	title: z.string(),
	page_start: z.int().nullable(),
	level: z.int(),
	page_end: z.int().nullable(),
	role: z.enum([
		"part",
		"chapter",
		"frontmatter",
		"backmatter",
		"other",
		"section",
	]),
	page_start_parquet: z.int().nullable(),
	page_end_parquet: z.int().nullable(),
});

export const fichePageOffsetSchema = z.object({
	intro_page_toc: z.int().nullable(),
	intro_page_parquet: z.int().nullable(),
	offset: z.int().nullable(),
	method: z.enum(["introduction-anchor", "failed"]),
});

export const ficheTocValidationSchema = z.object({
	issues: z.array(z.string()),
	ok: z.boolean(),
});

export const ficheStructureSchema = z.object({
	thesis_id: z.string(),
	parquet_blocks: z.int(),
	parquet_pages: z.int(),
	metadata: ficheMetadataSchema,
	toc: z.array(ficheTocEntrySchema),
	page_offset: fichePageOffsetSchema,
	toc_validation: ficheTocValidationSchema,
});

export type FicheMetadata = z.infer<typeof ficheMetadataSchema>;
export type FicheTocEntry = z.infer<typeof ficheTocEntrySchema>;
export type FichePageOffset = z.infer<typeof fichePageOffsetSchema>;
export type FicheTocValidation = z.infer<typeof ficheTocValidationSchema>;
export type FicheStructure = z.infer<typeof ficheStructureSchema>;

export function parseFicheStructure(value: string): FicheStructure {
	const parsed: unknown = JSON.parse(value);
	return ficheStructureSchema.parse(parsed);
}

export const ficheCallMetaSchema = z.object({
	budget: z.int(),
	discarded: z.boolean(),
	elapsed_s: z.number(),
	finish: z.string(),
	first_content_s: z.number(),
	looks_cut: z.boolean(),
	max_tokens: z.int(),
	reasoning_est_tokens: z.int(),
	retries: z.int(),
	temperature: z.number(),
	top_k: z.int(),
	top_p: z.number(),
	ts: z.string(),
});

export const ficheCallSchema = z.object({
	meta: ficheCallMetaSchema,
	output: z.string(),
	prompt: z.string(),
	reasoning: z.string(),
	system: z.string(),
});

export const ficheStepSchema = z.object({
	calls: z.array(ficheCallSchema),
	label: z.string(),
	output_file: z.string(),
	title: z.string(),
});

export const ficheSchema = z.object({
	dir: z.string(),
	fiche_md: z.string(),
	has_full_calls: z.boolean(),
	intro_md: z.string(),
	steps: z.array(ficheStepSchema),
	structure_json: z.string(),
	thesis: z.string(),
});

export const noteConfigSchema = z.object({
	blob_chars: z.int(),
	blob_tok_est: z.int(),
	fiche_path: z.string(),
	model: z.string(),
	parquet_path: z.string(),
	prompt_chars: z.int(),
	rlm_config: z.string(),
	run_id: z.string(),
	shim_env: z.object({
		GEMMA_SERVER_URL: z.string(),
	}),
	thesis: z.string(),
});

export const noteIterationTimingsSchema = z.object({
	cache_n: z.int(),
	draft_n: z.int(),
	draft_n_accepted: z.int(),
	predicted_ms: z.number(),
	predicted_n: z.int(),
	predicted_per_second: z.number(),
	prompt_ms: z.number(),
	prompt_n: z.int(),
});

export const noteIterationSchema = z.object({
	budget: z.int(),
	elapsed_s: z.number(),
	exec_stdout: z.string(),
	file: z.string(),
	finish: z.string(),
	input: z.string(),
	kind: z.string(),
	n: z.int(),
	output: z.string(),
	reasoning: z.string(),
	status: z.int(),
	system: z.string(),
	timings: noteIterationTimingsSchema,
});

export const noteMetadataSchema = z.object({
	iterations: z.int(),
	note_word_count: z.int(),
	rlm_status: z.string(),
	rlm_time_s: z.number(),
	run_dir: z.string(),
	sub_queries: z.int(),
	trace_files: z.int(),
	trace_root_calls: z.int(),
	trace_subquery_calls: z.int(),
	wall_time_s: z.number(),
});

export const noteSchema = z.object({
	config: noteConfigSchema,
	dir: z.string(),
	iterations: z.array(noteIterationSchema),
	metadata: noteMetadataSchema,
	note_md: z.string(),
	prompt: z.string(),
	rlm_stdout: z.string(),
	run_id: z.string(),
	thesis: z.string(),
});

export const docsSchema = z.object({
	fiche: ficheSchema,
	generated: z.string(),
	note: noteSchema,
});

export type FicheCallMeta = z.infer<typeof ficheCallMetaSchema>;
export type FicheCall = z.infer<typeof ficheCallSchema>;
export type FicheStep = z.infer<typeof ficheStepSchema>;
export type Fiche = z.infer<typeof ficheSchema>;
export type NoteConfig = z.infer<typeof noteConfigSchema>;
export type NoteIterationTimings = z.infer<typeof noteIterationTimingsSchema>;
export type NoteIteration = z.infer<typeof noteIterationSchema>;
export type NoteMetadata = z.infer<typeof noteMetadataSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Docs = z.infer<typeof docsSchema>;
