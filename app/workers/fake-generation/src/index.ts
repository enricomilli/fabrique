import { setTimeout as delay } from "node:timers/promises";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import pg from "pg";
import { z } from "zod";
import { docsSchema, parseFicheStructure, type Docs } from "../../../src/lib/docs.schema.js";
import {
  ficheMarkdown, fixture, iteration, labels, noteMarkdown, notePrompt, placeholder, step, structure,
} from "./content.js";

const jobSchema = z.object({
  documentId: z.string().min(1), userId: z.string().min(1),
  bucket: z.string().min(1), key: z.string().min(1),
});
type DocumentGenerationJob = z.infer<typeof jobSchema>;
type DocumentRow = {
  title: string | null;
  data: unknown;
  generation_completed: boolean;
};

if (process.env.FAKE_GENERATION_ENABLED !== "true") {
  throw new Error("Set FAKE_GENERATION_ENABLED=true to start the demo worker.");
}
const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ }).parse(process.env.DATABASE_URL);
const redisUrl = z.url({ protocol: /^rediss?$/ }).parse(process.env.REDIS_URL);
const queueName = z.string().min(1).parse(process.env.GENERATION_QUEUE_NAME ?? "document-generation");
const legacyDelay = process.env.FAKE_GENERATION_DELAY_MS === undefined ? undefined
  : z.coerce.number().int().min(0).max(3_600_000).parse(process.env.FAKE_GENERATION_DELAY_MS);
const duration = z.coerce.number().int().min(0).max(54_000_000)
  .parse(process.env.FAKE_GENERATION_DURATION_MS ?? (legacyDelay === undefined ? 720_000 : legacyDelay * 15));
const noteStart = 10;
const noteEnd = noteStart + fixture.note.iterations.length;
const iterationElapsed = fixture.note.iterations.reduce((sum, value) => sum + value.elapsed_s, 0);
// The note iteration pool uses 265 of the 720 seconds.
const stageSeconds = [
  2, 38, 64, 51, 22, 77, 100, 8, 6, 12,
  ...fixture.note.iterations.map((value) => 265 * value.elapsed_s / iterationElapsed),
  65, 10,
];
// Round cumulative boundaries so the delays total the configured duration exactly.
let boundary = 0;
let cumulativeSeconds = 0;
const stageDelays = stageSeconds.map((seconds, index) => {
  const previous = boundary;
  cumulativeSeconds += seconds;
  boundary = index === stageSeconds.length - 1 ? duration
    : Math.round(duration * cumulativeSeconds / 720);
  return boundary - previous;
});
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
connection.on("error", (error: Error) => console.error("Redis connection failed:", error.message));

const worker = new Worker<DocumentGenerationJob, void, "generate-document">(
  queueName,
  async (job: Job<DocumentGenerationJob, void, "generate-document">): Promise<void> => {
    if (job.name !== "generate-document") throw new Error("The job name must be generate-document.");
    const payload = jobSchema.parse(job.data);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [payload.documentId],
      );
      if (!lock.rows[0]?.locked) throw new Error("Another worker has this document. Retry the job.");
      const result = await client.query<DocumentRow>(
        `SELECT title, data, generation_completed FROM documents
         WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL`,
        [payload.documentId, payload.userId],
      );
      const row = result.rows[0];
      if (!row || row.generation_completed) return;
      let saved: unknown = row.data;
      const title = row.title ?? "Untitled upload";
      let data: Docs = saved === null ? placeholder(payload.documentId, title) : docsSchema.parse(saved);
      if (data.fiche.dir !== "demo" || data.note.dir !== "demo") {
        throw new Error("The document has non-demo data. Use the real generation worker.");
      }
      if (data.fiche.structure_json) parseFicheStructure(data.fiche.structure_json);
      if (data.fiche.steps.length > labels.length || data.fiche.steps.some((value, index) => value.label !== labels[index])
        || data.note.iterations.length > fixture.note.iterations.length
        || data.note.iterations.some((value, index) => value.n !== fixture.note.iterations[index].n || value.kind !== "root")) {
        throw new Error("The saved demo stages are invalid.");
      }

      // Each stage preserves saved outputs. The SQL also checks ownership and deletion.
      for (let stage = 0; stage < stageDelays.length; stage += 1) {
        const next = structuredClone(data);
        const stageDelay = stageDelays[stage];
        const seconds = stageDelay / 1000;
        const elapsedSeconds = stageDelays.slice(0, stage + 1).reduce((sum, value) => sum + value, 0) / 1000;
        const timestamp = new Date(Date.now() + stageDelay).toISOString();
        let complete = false;
        if (stage === 0) {
          if (saved !== null) continue;
        } else if (stage === 1) {
          if (next.fiche.structure_json && next.fiche.steps.length > 0) continue;
          next.fiche.structure_json ||= structure(payload.documentId, title);
          next.fiche.intro_md ||= fixture.fiche.intro_md;
          if (next.fiche.steps.length === 0) next.fiche.steps.push(step(0, timestamp, seconds));
        } else if (stage <= 7) {
          const indexes = stage <= 5 ? [stage - 1] : stage === 6 ? [5, 6] : [7];
          if (indexes.every((index) => next.fiche.steps.length > index)) continue;
          const groupedElapsed = Math.max(...indexes.map((index) =>
            fixture.fiche.steps[index].calls.reduce((sum, call) => sum + call.meta.elapsed_s, 0)));
          for (const index of indexes) {
            const actualElapsed = fixture.fiche.steps[index].calls.reduce((sum, call) => sum + call.meta.elapsed_s, 0);
            const callSeconds = groupedElapsed > 0 ? seconds * actualElapsed / groupedElapsed : 0;
            if (next.fiche.steps.length <= index) next.fiche.steps.push(step(index, timestamp, callSeconds));
          }
        } else if (stage === 8) {
          if (next.fiche.fiche_md) continue;
          next.fiche.fiche_md = ficheMarkdown;
        } else if (stage === 9) {
          if (next.note.prompt) continue;
          next.note.prompt = notePrompt;
          next.note.config = structuredClone(fixture.note.config);
          next.note.metadata.rlm_status = "running";
        } else if (stage < noteEnd) {
          const index = stage - noteStart;
          if (next.note.iterations.length > index) continue;
          next.note.iterations.push(iteration(index, seconds));
          const count = next.note.iterations.length;
          next.note.metadata = {
            ...next.note.metadata, iterations: count, trace_files: count,
            trace_root_calls: next.note.iterations.filter((value) => value.kind === "root").length,
            rlm_time_s: next.note.iterations.reduce((sum, value) => sum + value.elapsed_s, 0),
            wall_time_s: elapsedSeconds, rlm_status: "running",
          };
          next.note.rlm_stdout = next.note.iterations.map((value) => value.exec_stdout).join("\n\n");
        } else if (stage === noteEnd) {
          if (next.note.note_md) continue;
          next.note.note_md = noteMarkdown;
          next.note.rlm_stdout = fixture.note.rlm_stdout;
          next.note.metadata = {
            ...fixture.note.metadata,
            rlm_time_s: next.note.iterations.reduce((sum, value) => sum + value.elapsed_s, 0),
            wall_time_s: elapsedSeconds,
          };
        } else {
          if (!next.fiche.fiche_md.trim() || !next.note.note_md.trim()) {
            throw new Error("Both demo Markdown outputs must contain text before completion.");
          }
          next.note.metadata = {
            ...fixture.note.metadata,
            rlm_time_s: next.note.iterations.reduce((sum, value) => sum + value.elapsed_s, 0),
            wall_time_s: elapsedSeconds,
          };
          complete = true;
        }
        await delay(stageDelay);
        if (complete) next.generated ||= new Date().toISOString();
        docsSchema.parse(next);
        if (next.fiche.structure_json) parseFicheStructure(next.fiche.structure_json);
        const updated = await client.query(
          `UPDATE documents SET data = $3::jsonb, generation_completed = $4
           WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL
             AND generation_completed = false AND data IS NOT DISTINCT FROM $5::jsonb
           RETURNING id`,
          [payload.documentId, payload.userId, JSON.stringify(next), complete,
            saved === null ? null : JSON.stringify(saved)],
        );
        if (updated.rowCount !== 1) {
          const current = await client.query<{ generation_completed: boolean }>(
            `SELECT generation_completed FROM documents
             WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL`,
            [payload.documentId, payload.userId],
          );
          if (!current.rows[0] || current.rows[0].generation_completed) return;
          throw new Error("The document changed. Retry the job to read its saved stages.");
        }
        data = next;
        saved = next;
        console.info(`DEMO document ${payload.documentId}: stage ${stage}${complete ? " complete" : ""}`);
      }
    } finally {
      // Closing the session releases the document lock after success or failure.
      await client.end();
    }
  },
  { connection, concurrency: 1 },
);
worker.on("error", (error: Error) => console.error("Worker error:", error.message));
worker.on("failed", (job, error: Error) => console.error(`Job ${job?.id ?? "unknown"} failed:`, error.message));
await worker.waitUntilReady();
console.info(`DEMO worker ready: ${queueName}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await worker.close();
    await connection.quit();
  } catch (error: unknown) {
    console.error("Cannot stop the worker:", error);
    connection.disconnect();
    process.exitCode = 1;
  }
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
