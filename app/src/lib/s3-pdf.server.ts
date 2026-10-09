import { randomUUID } from "node:crypto";
import {
	GetObjectCommand,
	HeadObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { and, eq, isNull, or } from "drizzle-orm";
import { documents } from "../db/schema/documents.ts";
import { logDocumentError, logDocumentEvent } from "./document-log.ts";
import { parseRange } from "./pdf.server.ts";

interface S3Connection {
	client: S3Client;
	bucket: string;
}

let client: S3Client | undefined;

async function getS3Connection(): Promise<S3Connection> {
	const { env } = await import("../env.ts");
	if (!client) {
		const endpoint = new URL(env.S3_ENDPOINT);
		logDocumentEvent("document.storage.configured", {
			endpoint: `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`,
			bucket: env.S3_BUCKET,
			region: env.S3_REGION,
			forcePathStyle: env.S3_FORCE_PATH_STYLE,
		});
		client = new S3Client({
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
			forcePathStyle: env.S3_FORCE_PATH_STYLE,
			credentials: {
				accessKeyId: env.S3_ACCESS_KEY_ID,
				secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			},
		});
	}
	return { client, bucket: env.S3_BUCKET };
}

function isMissingObject(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === "NotFound" || error.name === "NoSuchKey") return true;
	if (
		"$metadata" in error &&
		typeof error.$metadata === "object" &&
		error.$metadata !== null
	) {
		return (
			"httpStatusCode" in error.$metadata &&
			error.$metadata.httpStatusCode === 404
		);
	}
	return false;
}

function isValidId(id: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !/[\r\n]/.test(id);
}

export async function findStoredPdf(
	id: string,
): Promise<{ size: number } | null> {
	if (!isValidId(id)) {
		logDocumentEvent("document.storage.head.rejected", {
			reason: "invalid_id",
		});
		return null;
	}
	const started = performance.now();
	let bucket: string | undefined;
	logDocumentEvent("document.storage.head.started", { documentId: id });
	try {
		const connection = await getS3Connection();
		bucket = connection.bucket;
		const object = await connection.client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: `pdfs/${id}.pdf` }),
		);
		if (object.ContentLength === undefined)
			throw new Error("The PDF size is unavailable.");
		logDocumentEvent("document.storage.head.completed", {
			documentId: id,
			bucket,
			bytes: object.ContentLength,
			httpStatusCode: object.$metadata.httpStatusCode,
			storageRequestId: object.$metadata.requestId,
			durationMs: Math.round(performance.now() - started),
		});
		return { size: object.ContentLength };
	} catch (error: unknown) {
		if (isMissingObject(error)) {
			logDocumentEvent("document.storage.head.missing", {
				documentId: id,
				bucket,
				durationMs: Math.round(performance.now() - started),
			});
			return null;
		}
		logDocumentError("document.storage.head.failed", error, {
			documentId: id,
			bucket,
			durationMs: Math.round(performance.now() - started),
		});
		throw error;
	}
}

export async function serveStoredPdf(
	request: Request,
	id: string,
): Promise<Response> {
	const started = performance.now();
	const requestId = randomUUID();
	const context = { requestId, documentId: id, method: request.method };
	logDocumentEvent("document.pdf.request.started", context);
	const headers = new Headers({
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	const errorResponse = (status: number, message: string): Response => {
		logDocumentEvent("document.pdf.request.rejected", {
			...context,
			status,
			reason: message,
			durationMs: Math.round(performance.now() - started),
		});
		headers.set("Content-Type", "text/plain; charset=utf-8");
		headers.delete("Content-Disposition");
		headers.delete("Content-Range");
		headers.set("Content-Length", String(Buffer.byteLength(message)));
		return new Response(request.method === "HEAD" ? null : message, {
			status,
			headers,
		});
	};
	if (request.method !== "GET" && request.method !== "HEAD") {
		headers.set("Allow", "GET, HEAD");
		return errorResponse(405, "Method not allowed.");
	}
	try {
		const { auth } = await import("../integrations/better-auth/index.ts");
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return errorResponse(401, "Unauthorized.");
		if (!isValidId(id)) return errorResponse(404, "PDF not found.");
		logDocumentEvent("document.pdf.auth.completed", context);
		const { db } = await import("../db/drizzle.ts");
		const [document] = await db
			.select({ id: documents.id })
			.from(documents)
			.where(
				and(
					eq(documents.id, id),
					isNull(documents.deletedAt),
					or(
						eq(documents.public, true),
						eq(documents.createdBy, session.user.id),
					),
				),
			)
			.limit(1);
		if (!document) return errorResponse(404, "PDF not found.");
		logDocumentEvent("document.pdf.access.completed", context);
		const s3 = await getS3Connection();
		const pdf = await findStoredPdf(id);
		if (!pdf) return errorResponse(404, "PDF not found.");
		headers.set("Accept-Ranges", "bytes");
		headers.set("Content-Type", "application/pdf");
		headers.set("Content-Disposition", `inline; filename="${id}.pdf"`);
		const range =
			request.method === "GET" && !request.headers.has("If-Range")
				? parseRange(request.headers.get("Range"), pdf.size)
				: null;
		if (range === "unsatisfied") {
			headers.set("Content-Range", `bytes */${pdf.size}`);
			headers.set("Content-Length", "0");
			logDocumentEvent("document.pdf.range.rejected", {
				...context,
				status: 416,
				bytes: pdf.size,
			});
			return new Response(null, { status: 416, headers });
		}
		const length = range ? range.end - range.start + 1 : pdf.size;
		headers.set("Content-Length", String(length));
		if (range)
			headers.set(
				"Content-Range",
				`bytes ${range.start}-${range.end}/${pdf.size}`,
			);
		const status = range ? 206 : 200;
		if (request.method === "HEAD" || length === 0) {
			logDocumentEvent("document.pdf.request.completed", {
				...context,
				status,
				bytes: length,
				durationMs: Math.round(performance.now() - started),
			});
			return new Response(null, { status, headers });
		}
		logDocumentEvent("document.storage.get.started", {
			...context,
			bucket: s3.bucket,
			rangeStart: range?.start,
			rangeEnd: range?.end,
		});
		const object = await s3.client.send(
			new GetObjectCommand({
				Bucket: s3.bucket,
				Key: `pdfs/${id}.pdf`,
				Range: range ? `bytes=${range.start}-${range.end}` : undefined,
			}),
		);
		if (!object.Body) throw new Error("The PDF body is unavailable.");
		logDocumentEvent("document.storage.get.completed", {
			...context,
			httpStatusCode: object.$metadata.httpStatusCode,
			storageRequestId: object.$metadata.requestId,
		});
		const reader = object.Body.transformToWebStream().getReader();
		let bytes = 0;
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const chunk = await reader.read();
					if (chunk.done) {
						logDocumentEvent("document.pdf.stream.completed", {
							...context,
							status,
							bytes,
							durationMs: Math.round(performance.now() - started),
						});
						controller.close();
					} else {
						bytes += chunk.value.byteLength;
						controller.enqueue(chunk.value);
					}
				} catch (error: unknown) {
					logDocumentError("document.pdf.stream.failed", error, {
						...context,
						bytes,
					});
					controller.error(error);
				}
			},
			async cancel() {
				logDocumentEvent("document.pdf.stream.canceled", {
					...context,
					bytes,
					durationMs: Math.round(performance.now() - started),
				});
				try {
					await reader.cancel();
				} catch (error: unknown) {
					logDocumentError("document.pdf.stream.cancel.failed", error, context);
					throw error;
				}
			},
		});
		return new Response(body, {
			status,
			headers,
		});
	} catch (error: unknown) {
		logDocumentError("document.pdf.request.failed", error, {
			...context,
			durationMs: Math.round(performance.now() - started),
		});
		return isMissingObject(error)
			? errorResponse(404, "PDF not found.")
			: errorResponse(500, "Cannot read the PDF.");
	}
}
