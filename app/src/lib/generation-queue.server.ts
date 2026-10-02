import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env";

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
): Promise<void> {
	if (!queue || !connection) {
		connection = new Redis(env.REDIS_URL, {
			connectTimeout: 5_000,
			maxRetriesPerRequest: 1,
			enableOfflineQueue: false,
		});
		connection.on("error", () => {
			console.error("The document generation queue connection failed.");
		});
		queue = new Queue<DocumentGenerationJob, void, "generate-document">(
			"document-generation",
			{ connection },
		);
		queue.on("error", () => {
			console.error("The document generation queue request failed.");
		});
	}
	const activeQueue = queue;
	const activeConnection = connection;
	let expired = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			expired = true;
			reject(new Error("The document generation queue timed out."));
		}, 8_000);
	});
	try {
		await Promise.race([
			(async () => {
				await activeQueue.waitUntilReady();
				if (expired)
					throw new Error("The document generation queue timed out.");
				await activeQueue.add("generate-document", payload, {
					jobId: payload.documentId,
					attempts: 3,
					backoff: { type: "exponential", delay: 5_000 },
				});
			})(),
			deadline,
		]);
	} catch (error: unknown) {
		expired = true;
		if (queue === activeQueue) {
			queue = undefined;
			connection = undefined;
		}
		activeConnection.disconnect();
		void activeQueue.close().catch(() => {
			console.error("Cannot close the document generation queue.");
		});
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
