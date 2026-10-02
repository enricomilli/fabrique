import { randomUUID } from "node:crypto";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	AbortMultipartUploadCommand,
	DeleteObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { db } from "../db/drizzle";
import { documents } from "../db/schema/documents";
import { env } from "../env";
import { auth } from "../integrations/better-auth";
import { enqueueDocumentGeneration } from "./generation-queue.server";
import { MAX_PDF_BYTES } from "./upload-limits";

type UploadErrorCode =
	| "invalid_pdf"
	| "too_large"
	| "upload_failed"
	| "unauthorized";

class UploadError extends Error {
	constructor(
		readonly code: UploadErrorCode,
		readonly status: number,
	) {
		super(code);
	}
}

// This checks the signature and size, not the complete PDF structure.
class PdfValidationStream extends Transform {
	private bytes = 0;
	private signature = Buffer.alloc(0);
	private signatureChecked = false;

	constructor(private readonly declaredBytes: number | undefined) {
		super({ highWaterMark: 64 * 1024 });
	}

	override _transform(
		chunk: Buffer,
		_encoding: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.bytes += chunk.length;
		if (this.bytes > MAX_PDF_BYTES) {
			callback(new UploadError("too_large", 413));
			return;
		}
		if (!this.signatureChecked) {
			const needed = 8 - this.signature.length;
			const prefix = chunk.subarray(0, needed);
			this.signature = Buffer.concat([this.signature, prefix]);
			if (this.signature.length < 8) {
				callback();
				return;
			}
			if (!/^%PDF-[0-9]\.[0-9]$/.test(this.signature.toString("latin1"))) {
				callback(new UploadError("invalid_pdf", 400));
				return;
			}
			this.signatureChecked = true;
			this.push(this.signature);
			callback(null, chunk.subarray(prefix.length));
			return;
		}
		callback(null, chunk);
	}

	override _flush(callback: TransformCallback): void {
		if (
			!this.signatureChecked ||
			(this.declaredBytes !== undefined && this.bytes !== this.declaredBytes)
		) {
			callback(new UploadError("invalid_pdf", 400));
			return;
		}
		callback();
	}
}

let s3: S3Client | undefined;

function getS3Client(): S3Client {
	s3 ??= new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		},
	});
	return s3;
}

async function storePdf(
	request: Request,
	key: string,
	declaredBytes: number | undefined,
): Promise<void> {
	if (!request.body) throw new UploadError("invalid_pdf", 400);
	const reader = request.body.getReader();
	const source = Readable.from(
		(async function* () {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					yield value;
				}
			} finally {
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
		})(),
		{ objectMode: false, highWaterMark: 64 * 1024 },
	);
	const validated = new PdfValidationStream(declaredBytes);
	const upload = new Upload({
		client: getS3Client(),
		params: {
			Bucket: env.S3_BUCKET,
			Key: key,
			Body: validated,
			ContentType: "application/pdf",
		},
		queueSize: 2,
		partSize: 8 * 1024 * 1024,
		leavePartsOnError: false,
	});
	const stop = (): void => {
		source.destroy(new UploadError("upload_failed", 500));
		validated.destroy(new UploadError("upload_failed", 500));
		void reader.cancel().catch(() => undefined);
	};
	request.signal.addEventListener("abort", stop, { once: true });
	const streamed = pipeline(source, validated);
	const stored = upload.done();
	try {
		if (request.signal.aborted) stop();
		await Promise.all([streamed, stored]);
		if (request.signal.aborted) throw new UploadError("upload_failed", 500);
	} catch (error: unknown) {
		stop();
		// Wait for S3 requests before cleanup. Upload.abort() alone returns before those requests finish.
		await Promise.allSettled([streamed, stored]);
		await upload.abort();
		if (upload.uploadId) {
			await getS3Client()
				.send(
					new AbortMultipartUploadCommand({
						Bucket: env.S3_BUCKET,
						Key: key,
						UploadId: upload.uploadId,
					}),
				)
				.catch((cleanupError: unknown) => {
					if (
						!(
							cleanupError instanceof Error &&
							cleanupError.name === "NoSuchUpload"
						)
					) {
						console.error("Cannot abort an incomplete PDF upload.");
					}
				});
		}
		// A completed object can race with cancellation. Delete it as well.
		await getS3Client()
			.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
			.catch(() => {
				console.error("Cannot delete an incomplete PDF upload.");
			});
		throw error;
	} finally {
		request.signal.removeEventListener("abort", stop);
	}
}

function validateRequest(request: Request): {
	filename: string;
	isPublic: boolean;
	declaredBytes: number | undefined;
} {
	const url = new URL(request.url);
	const origin = request.headers.get("origin");
	const configuredOrigin = env.SERVER_URL
		? new URL(env.SERVER_URL).origin
		: undefined;
	if (!origin || (origin !== url.origin && origin !== configuredOrigin)) {
		throw new UploadError("unauthorized", 403);
	}
	const filename = url.searchParams.get("filename");
	const visibility = url.searchParams.get("public");
	if (
		request.headers
			.get("content-type")
			?.split(";", 1)[0]
			.trim()
			.toLowerCase() !== "application/pdf" ||
		!filename ||
		filename.length > 255 ||
		!/\.pdf$/i.test(filename) ||
		filename.length <= 4 ||
		/[/\\]/.test(filename) ||
		Array.from(filename).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) ||
		(visibility !== null && visibility !== "true" && visibility !== "false") ||
		(request.headers.has("content-encoding") &&
			request.headers.get("content-encoding") !== "identity") ||
		!request.body
	)
		throw new UploadError("invalid_pdf", 400);
	const length = request.headers.get("content-length");
	let declaredBytes: number | undefined;
	if (length !== null) {
		if (!/^\d+$/.test(length)) throw new UploadError("invalid_pdf", 400);
		if (BigInt(length) > BigInt(MAX_PDF_BYTES))
			throw new UploadError("too_large", 413);
		declaredBytes = Number(length);
		if (declaredBytes < 8) throw new UploadError("invalid_pdf", 400);
	}
	return { filename, isPublic: visibility === "true", declaredBytes };
}

export async function uploadDocument(request: Request): Promise<Response> {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) throw new UploadError("unauthorized", 401);
		const { filename, isPublic, declaredBytes } = validateRequest(request);
		const id = randomUUID();
		const key = `pdfs/${id}.pdf`;
		await storePdf(request, key, declaredBytes);
		try {
			await db.insert(documents).values({
				id,
				title: filename,
				data: null,
				generationCompleted: false,
				createdBy: session.user.id,
				public: isPublic,
			});
		} catch (error: unknown) {
			await getS3Client()
				.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
				.catch(() => {
					console.error(
						"Cannot delete the PDF after a document insert failed.",
					);
				});
			throw error;
		}
		try {
			await enqueueDocumentGeneration({
				documentId: id,
				userId: session.user.id,
				bucket: env.S3_BUCKET,
				key,
			});
		} catch {
			// Redis can accept a job before its reply fails. Preserve the document for recovery.
			return Response.json(
				{ error: "upload_failed", id },
				{ status: 503, headers: { "Cache-Control": "no-store" } },
			);
		}
		return Response.json(
			{ id },
			{ status: 201, headers: { "Cache-Control": "no-store" } },
		);
	} catch (error: unknown) {
		if (!request.body?.locked)
			void request.body?.cancel().catch(() => undefined);
		const failure =
			error instanceof UploadError
				? error
				: new UploadError("upload_failed", 500);
		return Response.json(
			{ error: failure.code },
			{ status: failure.status, headers: { "Cache-Control": "no-store" } },
		);
	}
}
