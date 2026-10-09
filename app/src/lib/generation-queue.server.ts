import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env";
import { logDocumentError, logDocumentEvent } from "./document-log";

export type DocumentGenerationJob = {
	documentId: string;
	userId: string;
	bucket: string;
	key: string;
};

// Workers consume generate-document from document-generation with documentId as the job ID.
// Read bucket/key. Check ownership and deletion before work. Make retries safe.
// Save validated data and set generationCompleted=true only after successful generation.
// Queue errors can have uncertain outcomes. Recovery must reuse the document ID.
let queue: Queue<DocumentGenerationJob, void, "generate-document"> | undefined;
let connection: Redis | undefined;

export async function enqueueDocumentGeneration(
	payload: DocumentGenerationJob,
	requestId?: string,
): Promise<void> {
	const startedAt = Date.now();
	const context = { requestId, documentId: payload.documentId };
	logDocumentEvent("document.queue.enqueue.start", context);
	if (!queue || !connection) {
		logDocumentEvent("document.queue.connection.start", context);
		connection = new Redis(env.REDIS_URL, {
			connectTimeout: 5_000,
			maxRetriesPerRequest: 1,
			enableOfflineQueue: false,
		});
		connection.on("error", (error: unknown) => {
			logDocumentError("document.queue.connection.error", error);
		});
		queue = new Queue<DocumentGenerationJob, void, "generate-document">(
			"document-generation",
			{ connection },
		);
		queue.on("error", (error: unknown) => {
			logDocumentError("document.queue.error", error);
		});
	}
	const activeQueue = queue;
	const activeConnection = connection;
	let expired = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			expired = true;
			logDocumentEvent("document.queue.enqueue.deadline", {
				...context,
				durationMs: Date.now() - startedAt,
				deadlineMs: 8_000,
			});
			reject(new Error("The document generation queue timed out."));
		}, 8_000);
	});
	try {
		await Promise.race([
			(async () => {
				const readyStartedAt = Date.now();
				logDocumentEvent("document.queue.wait_ready.start", context);
				try {
					await activeQueue.waitUntilReady();
				} catch (error: unknown) {
					logDocumentError("document.queue.wait_ready.error", error, {
						...context,
						durationMs: Date.now() - readyStartedAt,
					});
					throw error;
				}
				if (expired)
					throw new Error("The document generation queue timed out.");
				logDocumentEvent("document.queue.wait_ready.success", {
					...context,
					durationMs: Date.now() - readyStartedAt,
				});
				const addStartedAt = Date.now();
				logDocumentEvent("document.queue.add.start", context);
				try {
					await activeQueue.add("generate-document", payload, {
						jobId: payload.documentId,
						attempts: 3,
						backoff: { type: "exponential", delay: 5_000 },
					});
					logDocumentEvent("document.queue.add.success", {
						...context,
						durationMs: Date.now() - addStartedAt,
						deadlineExpired: expired,
					});
				} catch (error: unknown) {
					logDocumentError("document.queue.add.error", error, {
						...context,
						durationMs: Date.now() - addStartedAt,
					});
					throw error;
				}
			})(),
			deadline,
		]);
		logDocumentEvent("document.queue.enqueue.success", {
			...context,
			durationMs: Date.now() - startedAt,
		});
	} catch (error: unknown) {
		logDocumentError("document.queue.enqueue.uncertain_failure", error, {
			...context,
			durationMs: Date.now() - startedAt,
			deadlineExpired: expired,
		});
		expired = true;
		logDocumentEvent("document.queue.cleanup.start", context);
		if (queue === activeQueue) {
			queue = undefined;
			connection = undefined;
		}
		activeConnection.disconnect();
		void activeQueue
			.close()
			.then(() => {
				logDocumentEvent("document.queue.cleanup.success", context);
			})
			.catch((cleanupError: unknown) => {
				logDocumentError("document.queue.cleanup.error", cleanupError, context);
			});
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
