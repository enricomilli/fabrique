import {
	GetObjectCommand,
	HeadObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { and, eq, isNull, or } from "drizzle-orm";
import { documents } from "../db/schema/documents.ts";
import { parseRange } from "./pdf.server.ts";

interface S3Connection {
	client: S3Client;
	bucket: string;
}

let client: S3Client | undefined;

async function getS3Connection(): Promise<S3Connection> {
	const { env } = await import("../env.ts");
	client ??= new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		},
	});
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
	if (!isValidId(id)) return null;
	const { client, bucket } = await getS3Connection();
	try {
		const object = await client.send(
			new HeadObjectCommand({
				Bucket: bucket,
				Key: `pdfs/${id}.pdf`,
			}),
		);
		if (object.ContentLength === undefined)
			throw new Error("The PDF size is unavailable.");
		return { size: object.ContentLength };
	} catch (error: unknown) {
		if (isMissingObject(error)) return null;
		throw error;
	}
}

export async function serveStoredPdf(
	request: Request,
	id: string,
): Promise<Response> {
	const headers = new Headers({
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	const errorResponse = (status: number, message: string): Response => {
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
		if (request.method === "HEAD" || length === 0)
			return new Response(null, { status, headers });
		const object = await s3.client.send(
			new GetObjectCommand({
				Bucket: s3.bucket,
				Key: `pdfs/${id}.pdf`,
				Range: range ? `bytes=${range.start}-${range.end}` : undefined,
			}),
		);
		if (!object.Body) throw new Error("The PDF body is unavailable.");
		return new Response(object.Body.transformToWebStream(), {
			status,
			headers,
		});
	} catch (error: unknown) {
		return isMissingObject(error)
			? errorResponse(404, "PDF not found.")
			: errorResponse(500, "Cannot read the PDF.");
	}
}
