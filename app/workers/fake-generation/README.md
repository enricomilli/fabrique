# Fake generation worker

This standalone worker replays `explorer/daley_thesis/data.json`. It does not read uploads or call a model.
The fixture title is **CMB LENSING MEASUREMENTS WITH TWO YEARS OF DATA FROM THE SPT-3G SURVEY**.
`fixtures/data.json` is an exact copy of that source fixture.
Upload the matching PDF to make the review content match the document reader.
Other PDFs still receive the same fixture content, not a review of their uploaded text.
The worker preserves the uploaded title. Both `fiche.dir` and `note.dir` equal `demo` for the existing safeguards.
No schema migration is needed.

## Start

Use Node.js 22 or later. Start PostgreSQL and Redis with the app services.
Do not run this worker beside a real worker on the same queue.

Run these commands from this directory:

```sh
npm ci
npm run build
FAKE_GENERATION_ENABLED=true npx dotenv -e ../../.env.local -- npm start
```

For development:

```sh
FAKE_GENERATION_ENABLED=true npx dotenv -e ../../.env.local -- node --import tsx src/index.ts
```

The environment file is the app environment file, two directories above this directory.
The worker does not load it automatically.

| Environment variable | Value |
| --- | --- |
| `FAKE_GENERATION_ENABLED` | Must equal `true`. |
| `DATABASE_URL` | PostgreSQL connection URL. |
| `REDIS_URL` | Redis connection URL. |
| `FAKE_GENERATION_DURATION_MS` | Total stage delay. Default: `720000` (12 minutes). Range: `0` to `54000000`. |
| `FAKE_GENERATION_DELAY_MS` | Legacy setting. Sets the total delay to this value times 15 unless the duration setting exists. |
| `GENERATION_QUEUE_NAME` | Queue name. Default: `document-generation`. Use a separate name for E2E tests. |

## Docker

Run these commands from the repository root:

```sh
docker build -f app/workers/fake-generation/Dockerfile -t fabrique-fake-generation .
docker run --rm --init --env-file app/.env.local \
  -e FAKE_GENERATION_ENABLED=true \
  -e DATABASE_URL='postgresql://user:password@host.docker.internal:5432/app' \
  -e REDIS_URL='redis://host.docker.internal:6379' \
  fabrique-fake-generation
```

Replace the database credentials with your local values.
Use reachable database and Redis hosts. Container `localhost` does not refer to the host machine.
Docker Desktop provides `host.docker.internal`. On Linux, add `--add-host=host.docker.internal:host-gateway`.
The image contains no environment file. Demo mode requires the explicit runtime setting.
Allow enough shutdown time for an active demo job. The default Docker stop timeout can interrupt it.

## Contract

The worker consumes `generate-document` jobs with this payload:

```ts
type DocumentGenerationJob = {
  documentId: string;
  userId: string;
  bucket: string;
  key: string;
};
```

The app uses `documentId` as the job ID. The worker accepts `bucket` and `key` but does not fetch their source path.
The replay keeps the fixture config, including its original paths and model name. Those values describe the recorded run.

Each update checks ownership, deletion, completion, and the previous JSON value with conditional SQL.
Deleted documents, missing documents, ownership changes, and completed documents cause no further updates.
A PostgreSQL session lock prevents concurrent demo jobs for the same document.
Retries keep saved outputs and skip saved stages. Changed data causes a retry.
The worker rejects invalid saved schemas, invalid stage sequences, and non-demo data.

## Saved stages

1. Save a complete, schema-valid placeholder.
2. Save the fixture structure JSON, introduction, and step `1` together.
3. Save fiche steps `2a`, `2b`, `2c`, and `2d`, one update per step.
4. Save methodology and concepts steps `3a` and `3b` together with matching timestamps.
5. Save the `final` step, which has no calls.
6. Save `fiche_md`.
7. Save the fixture note config and prompt.
8. Save all nine root note iterations, one update per iteration.
9. Save the fixture note metadata, full stdout, and `note_md`.
10. Check that both Markdown outputs contain text.
11. Set `generated` and `generation_completed=true` in one final update.

The replay keeps actual fixture outputs, prompts, reasoning, code, call settings, and token counts.
Each step stores its output text in `output_file`, not a file path.
No code executes. No model calls occur. The config server URL is recorded data only.
The worker scales call durations, first-content durations, and iteration timings to the simulated stage delays.
Iteration metadata counts reflect saved iterations. RLM time is the cumulative sum of saved iteration durations.
Completion restores the fixture metadata with simulated RLM and wall times.

A new job has exactly 12 minutes of delays, plus database and queue overhead.
The first ten stage weights are `2, 38, 64, 51, 22, 77, 100, 8, 6, 12` seconds.
Methodology and concepts share the 100-second stage. Their call durations retain the fixture duration ratio.
The nine note iterations share 265 seconds in proportion to their fixture `elapsed_s` values.
The note final stage takes 65 seconds. Completion takes 10 seconds.
The duration setting scales all delays. Cumulative rounding keeps the total delay exact.
The legacy delay setting still sets the total delay to its value times 15 for fast E2E runs.
Retries skip saved stages and take less time.

The worker validates the fixture with `docsSchema` at load and validates every snapshot before each save.
It also validates the structure JSON, fiche label order, empty final calls, and nine ordered root iterations.
Both `src/content.ts` and `dist/index.js` load `../fixtures/data.json` with `readFileSync` and `import.meta.url`.
The Docker build and runtime image include the copied fixture. No explorer directory is needed at runtime.

## Helper API

`src/content.ts` keeps these exports for the existing activity E2E test:

- `placeholder(documentId, title)` returns an empty replay snapshot with the uploaded identity.
- `structure(documentId, title)` returns the exact fixture structure. The parameters remain for compatibility.
- `step(index, timestamp, seconds)` clones a fixture step and scales its call timings.
- `iteration(index, seconds)` clones a fixture iteration and scales its timings.
- `ficheMarkdown`, `noteMarkdown`, `notePrompt`, and `labels` expose the fixture content and validated label order.
- `fixture` exposes the validated source data for the worker schedule and final metadata.
SIGINT and SIGTERM wait for the active job before the worker closes its connections.
