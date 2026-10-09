import { setTimeout as delay } from "node:timers/promises";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import pg from "pg";
import { z } from "zod";
import { docsSchema, parseFicheStructure, type Docs } from "../../../src/lib/docs.schema.js";
import { logDocumentEvent, logDocumentError } from "../../../src/lib/document-log.js";
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
logDocumentEvent("worker.start", {
  databaseHost: new URL(databaseUrl).hostname, redisHost: new URL(redisUrl).hostname,
  queue: queueName, durationMs: duration, stageCount: stageDelays.length,
});
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
connection.on("error", (error: Error) => logDocumentError("worker.redis.failed", error));

const worker = new Worker<DocumentGenerationJob, void, "generate-document">(
  queueName,
  async (job: Job<DocumentGenerationJob, void, "generate-document">): Promise<void> => {
    const started = Date.now();
    const context: { jobId: string | undefined; documentId?: string; retryAttempt: number; queue: string } = {
      jobId: job.id, retryAttempt: job.attemptsMade, queue: queueName,
    };
    let operation = "job.validate";
    let stageIndex: number | undefined;
    let stageName: string | undefined;
    logDocumentEvent("worker.job.start", context);
    try {
      if (job.name !== "generate-document") throw new Error("The job name must be generate-document.");
      const payload = jobSchema.parse(job.data);
      context.documentId = payload.documentId;
      const client = new pg.Client({ connectionString: databaseUrl });
      operation = "db.connect";
      logDocumentEvent("worker.db.connect.start", context);
      await client.connect();
      logDocumentEvent("worker.db.connect.complete", { ...context, durationMs: Date.now() - started });
      try {
        operation = "db.advisory_lock";
        logDocumentEvent("worker.db.advisory_lock.start", { ...context, documentId: payload.documentId });
        const lock = await client.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [payload.documentId],
        );
        logDocumentEvent("worker.db.advisory_lock.result", { ...context, locked: lock.rows[0]?.locked ?? false });
        if (!lock.rows[0]?.locked) throw new Error("Another worker has this document. Retry the job.");
        operation = "db.select";
        logDocumentEvent("worker.db.select.start", context);
        const result = await client.query<DocumentRow>(
          `SELECT title, data, generation_completed FROM documents
           WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL`,
          [payload.documentId, payload.userId],
        );
        const row = result.rows[0];
        logDocumentEvent("worker.db.select.result", {
          ...context, found: Boolean(row), generationCompleted: row?.generation_completed,
        });
        if (!row || row.generation_completed) {
          logDocumentEvent("worker.job.finish", {
            ...context, outcome: "skipped", reason: row ? "already_complete" : "document_missing",
            durationMs: Date.now() - started,
          });
          return;
        }
        operation = "document.validate";
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
          stageIndex = stage;
          stageName = stage < noteStart
            ? ["placeholder", "fiche_structure", "fiche_step_1", "fiche_step_2", "fiche_step_3",
              "fiche_step_4", "fiche_steps_5_6", "fiche_step_7", "fiche_markdown", "note_prompt"][stage]
            : stage < noteEnd ? "note_iteration" : stage === noteEnd ? "note_markdown" : "completion";
          operation = "stage.prepare";
          const stageStarted = Date.now();
          const stageContext = {
            ...context, stageIndex, stageName, delayMs: stageDelays[stage],
            computedElapsedMs: stageDelays.slice(0, stage + 1).reduce((sum, value) => sum + value, 0),
          };
          const resumeSkip = (): void => {
            logDocumentEvent("worker.stage.resume_skip", { ...stageContext, durationMs: Date.now() - stageStarted });
          };
          logDocumentEvent("worker.stage.start", stageContext);
          const next = structuredClone(data);
          const stageDelay = stageDelays[stage];
          const seconds = stageDelay / 1000;
          const elapsedSeconds = stageDelays.slice(0, stage + 1).reduce((sum, value) => sum + value, 0) / 1000;
          const timestamp = new Date(Date.now() + stageDelay).toISOString();
          let complete = false;
          if (stage === 0) {
            if (saved !== null) { resumeSkip(); continue; }
          } else if (stage === 1) {
            if (next.fiche.structure_json && next.fiche.steps.length > 0) { resumeSkip(); continue; }
            next.fiche.structure_json ||= structure(payload.documentId, title);
            next.fiche.intro_md ||= fixture.fiche.intro_md;
            if (next.fiche.steps.length === 0) next.fiche.steps.push(step(0, timestamp, seconds));
          } else if (stage <= 7) {
            const indexes = stage <= 5 ? [stage - 1] : stage === 6 ? [5, 6] : [7];
            if (indexes.every((index) => next.fiche.steps.length > index)) { resumeSkip(); continue; }
            const groupedElapsed = Math.max(...indexes.map((index) =>
              fixture.fiche.steps[index].calls.reduce((sum, call) => sum + call.meta.elapsed_s, 0)));
            for (const index of indexes) {
              const actualElapsed = fixture.fiche.steps[index].calls.reduce((sum, call) => sum + call.meta.elapsed_s, 0);
              const callSeconds = groupedElapsed > 0 ? seconds * actualElapsed / groupedElapsed : 0;
              if (next.fiche.steps.length <= index) next.fiche.steps.push(step(index, timestamp, callSeconds));
            }
          } else if (stage === 8) {
            if (next.fiche.fiche_md) { resumeSkip(); continue; }
            next.fiche.fiche_md = ficheMarkdown;
          } else if (stage === 9) {
            if (next.note.prompt) { resumeSkip(); continue; }
            next.note.prompt = notePrompt;
            next.note.config = structuredClone(fixture.note.config);
            next.note.metadata.rlm_status = "running";
          } else if (stage < noteEnd) {
            const index = stage - noteStart;
            if (next.note.iterations.length > index) { resumeSkip(); continue; }
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
            if (next.note.note_md) { resumeSkip(); continue; }
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
          operation = "stage.delay";
          logDocumentEvent("worker.stage.delay.start", stageContext);
          await delay(stageDelay);
          if (complete) next.generated ||= new Date().toISOString();
          operation = "stage.validate";
          docsSchema.parse(next);
          if (next.fiche.structure_json) parseFicheStructure(next.fiche.structure_json);
          operation = "stage.save";
          const saveStarted = Date.now();
          logDocumentEvent("worker.stage.save.start", stageContext);
          const updated = await client.query(
            `UPDATE documents SET data = $3::jsonb, generation_completed = $4
             WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL
               AND generation_completed = false AND data IS NOT DISTINCT FROM $5::jsonb
             RETURNING id`,
            [payload.documentId, payload.userId, JSON.stringify(next), complete,
              saved === null ? null : JSON.stringify(saved)],
          );
          logDocumentEvent("worker.stage.save.result", {
            ...stageContext, rowCount: updated.rowCount, durationMs: Date.now() - saveStarted, complete,
          });
          if (updated.rowCount !== 1) {
            operation = "db.reselect";
            logDocumentEvent("worker.db.reselect.start", stageContext);
            const current = await client.query<{ generation_completed: boolean }>(
              `SELECT generation_completed FROM documents
               WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL`,
              [payload.documentId, payload.userId],
            );
            logDocumentEvent("worker.db.reselect.result", {
              ...stageContext, found: Boolean(current.rows[0]),
              generationCompleted: current.rows[0]?.generation_completed,
            });
            if (!current.rows[0] || current.rows[0].generation_completed) {
              logDocumentEvent("worker.job.finish", {
                ...stageContext, outcome: "skipped",
                reason: current.rows[0] ? "already_complete" : "document_missing",
                durationMs: Date.now() - started,
              });
              return;
            }
            throw new Error("The document changed. Retry the job to read its saved stages.");
          }
          data = next;
          saved = next;
          logDocumentEvent("worker.stage.complete", {
            ...stageContext, complete, durationMs: Date.now() - stageStarted,
          });
        }
      } finally {
        // Closing the session releases the document lock after success or failure.
        logDocumentEvent("worker.db.close.start", context);
        await client.end();
        logDocumentEvent("worker.db.close.complete", context);
      }
      logDocumentEvent("worker.job.finish", { ...context, outcome: "complete", durationMs: Date.now() - started });
    } catch (error: unknown) {
      logDocumentError("worker.job.failed", error, {
        ...context, operation, stageIndex, stageName, durationMs: Date.now() - started,
      });
      throw error;
    }
  },
  { connection, concurrency: 1 },
);
worker.on("error", (error: Error) => logDocumentError("worker.failed", error, { queue: queueName }));
worker.on("failed", (job, error: Error) => logDocumentError("worker.job.retry_or_failure", error, {
  jobId: job?.id, documentId: job?.id, retryAttempt: job?.attemptsMade, queue: queueName,
}));
try {
  await worker.waitUntilReady();
  logDocumentEvent("worker.ready", { queue: queueName });
} catch (error: unknown) {
  logDocumentError("worker.start.failed", error, { queue: queueName });
  throw error;
}

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  const started = Date.now();
  logDocumentEvent("worker.shutdown.start", { queue: queueName });
  try {
    await worker.close();
    await connection.quit();
    logDocumentEvent("worker.shutdown.complete", { queue: queueName, durationMs: Date.now() - started });
  } catch (error: unknown) {
    logDocumentError("worker.shutdown.failed", error, {
      queue: queueName, durationMs: Date.now() - started,
    });
    connection.disconnect();
    process.exitCode = 1;
  }
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
