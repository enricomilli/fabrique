import { readFileSync } from "node:fs";
import {
  docsSchema,
  parseFicheStructure,
  type Docs,
  type FicheStep,
  type NoteIteration,
} from "../../../src/lib/docs.schema.js";
import { reasoningSchema, type Reasoning } from "../../../src/lib/reasoning.schema.js";

const source: unknown = JSON.parse(readFileSync(new URL("../fixtures/data.json", import.meta.url), "utf8"));
export const fixture = docsSchema.parse(source);
parseFicheStructure(fixture.fiche.structure_json);
export const labels = ["1", "2a", "2b", "2c", "2d", "3a", "3b", "final"] as const;
if (fixture.fiche.steps.length !== labels.length
  || fixture.fiche.steps.some((value, index) => value.label !== labels[index])
  || fixture.fiche.steps.at(-1)?.calls.length !== 0
  || fixture.note.iterations.length !== 9
  || fixture.note.iterations.some((value, index) => value.kind !== "root" || value.n !== index + 1 || value.elapsed_s <= 0)) {
  throw new Error("The replay fixture stages are invalid.");
}

export const ficheMarkdown = fixture.fiche.fiche_md;
export const noteMarkdown = fixture.note.note_md;
export const notePrompt = fixture.note.prompt;

export function placeholder(documentId: string, title: string): Docs {
  const data = structuredClone(fixture);
  data.generated = "";
  data.fiche = {
    ...data.fiche, dir: "demo", thesis: title, fiche_md: "", intro_md: "",
    steps: [], structure_json: "",
  };
  data.note = {
    ...data.note, dir: "demo", thesis: title, run_id: documentId,
    prompt: "", note_md: "", rlm_stdout: "", iterations: [],
    metadata: {
      ...data.note.metadata, iterations: 0, note_word_count: 0, rlm_status: "pending",
      rlm_time_s: 0, sub_queries: 0, trace_files: 0, trace_root_calls: 0,
      trace_subquery_calls: 0, wall_time_s: 0,
    },
  };
  return docsSchema.parse(data);
}

export function structure(_documentId: string, _title: string): string {
  return fixture.fiche.structure_json;
}

export function step(index: number, timestamp: string, seconds: number): FicheStep {
  const source = fixture.fiche.steps[index];
  if (!source) throw new Error("The replay step index is invalid.");
  const result = structuredClone(source);
  const elapsed = source.calls.reduce((sum, call) => sum + call.meta.elapsed_s, 0);
  const scale = elapsed > 0 ? seconds / elapsed : 0;
  for (const call of result.calls) {
    call.meta.elapsed_s *= scale;
    call.meta.first_content_s *= scale;
    call.meta.ts = timestamp;
  }
  return result;
}

export function iteration(index: number, seconds: number): NoteIteration {
  const source = fixture.note.iterations[index];
  if (!source) throw new Error("The replay iteration index is invalid.");
  const result = structuredClone(source);
  const scale = seconds / source.elapsed_s;
  result.elapsed_s = seconds;
  result.timings.prompt_ms *= scale;
  result.timings.predicted_ms *= scale;
  result.timings.predicted_per_second = scale > 0 ? source.timings.predicted_per_second / scale : 0;
  return result;
}

const reasoningSource: unknown = JSON.parse(readFileSync(new URL("../fixtures/reasoning.json", import.meta.url), "utf8"));
export const reasoningFixture = reasoningSchema.parse(reasoningSource);
const reasoningIterations = reasoningFixture.sections.find((section) => section.id === "iterations");
if (!reasoningIterations || reasoningIterations.data.items.length !== fixture.note.iterations.length
  || reasoningIterations.data.items.some((item, index) => item.n !== fixture.note.iterations[index].n)) {
  throw new Error("The reasoning fixture iterations are invalid.");
}
const iterationSection = reasoningIterations;

export function reasoningSnapshot(data: Docs, saved: Reasoning | null, complete: boolean): Reasoning {
  const result = structuredClone(reasoningFixture);
  const previous = saved?.sections.find((section) => section.id === "iterations");
  const items = data.note.iterations.map((note, index) => {
    const item = structuredClone(previous?.data.items[index] ?? iterationSection.data.items[index]);
    item.seconds = note.elapsed_s;
    item.header_label = `Itération ${item.n} · ${new Intl.NumberFormat("fr", { maximumFractionDigits: 1 }).format(item.seconds)} s`;
    return item;
  });
  if (!complete) {
    result.sections = [{ ...structuredClone(iterationSection), data: { items } }];
  } else {
    for (const section of result.sections) {
      if (section.id === "iterations") section.data.items = items;
      if (section.id === "iteration_bars") {
        section.data.items = items.map(({ n, kind, seconds }) => ({ n, kind, seconds }));
        section.data.max_seconds = Math.max(0, ...items.map((item) => item.seconds));
      }
      if (section.id === "kpis") {
        for (const item of section.data.items) {
          if (item.key !== "iterations") continue;
          item.raw.seconds = items.reduce((sum, iteration) => sum + iteration.seconds, 0);
          item.caption = `itérations · ${Math.round(item.raw.seconds)} s · ${item.raw.note_words} mots`;
        }
      }
    }
  }
  return reasoningSchema.parse(result);
}

export function validateSavedReasoning(value: unknown, data: Docs): Reasoning | null {
  if (value === null) return null;
  const saved = reasoningSchema.parse(value);
  const items = saved.sections[0];
  if (saved.source.run_id !== reasoningFixture.source.run_id
    || saved.source.thesis_id !== reasoningFixture.source.thesis_id
    || saved.sections.length !== 1 || items?.id !== "iterations"
    || items.data.items.length > data.note.iterations.length
    || items.data.items.some((item, index) => item.n !== data.note.iterations[index].n)) {
    throw new Error("The saved demo reasoning stages are invalid.");
  }
  return saved;
}
