import { readFileSync } from "node:fs";
import {
  docsSchema,
  parseFicheStructure,
  type Docs,
  type FicheStep,
  type NoteIteration,
} from "../../../src/lib/docs.schema.js";

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
