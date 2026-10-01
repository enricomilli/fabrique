import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { Readable } from "node:stream";

export function getPdfDirectory(): string {
	const directory = process.env.PDF_DIR?.trim();
	if (!directory) return resolve(process.cwd(), "../data/pdf");
	if (!isAbsolute(directory)) {
		throw new Error("PDF_DIR must be an absolute directory path.");
	}
	return directory;
}

export async function findPdf(
	id: string,
	directory: string = getPdfDirectory(),
): Promise<{ path: string; size: number } | null> {
	const validId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.exec(id);
	if (!validId || validId[0] !== id) return null;
	try {
		const root = await realpath(directory);
		const path = await realpath(join(root, `${id}.pdf`));
		const local = relative(root, path);
		if (
			!local ||
			isAbsolute(local) ||
			local === ".." ||
			local.startsWith(`..${sep}`)
		) {
			return null;
		}
		const file = await stat(path);
		return file.isFile() ? { path, size: file.size } : null;
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			"code" in error &&
			["ENOENT", "ENOTDIR", "ELOOP"].includes(String(error.code))
		)
			return null;
		throw new Error("Cannot read the PDF.");
	}
}

type ByteRange = { start: number; end: number };

function parseRange(
	value: string | null,
	size: number,
): ByteRange | "unsatisfied" | null {
	if (value === null) return null;
	// Ignore malformed ranges, unsupported units, and multiple ranges.
	const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
	if (!match || (!match[1] && !match[2])) return null;
	const length = BigInt(size);
	if (!match[1]) {
		const suffix = BigInt(match[2]);
		if (suffix === 0n || size === 0) return "unsatisfied";
		return {
			start: Number(suffix >= length ? 0n : length - suffix),
			end: size - 1,
		};
	}
	const start = BigInt(match[1]);
	const end = match[2] ? BigInt(match[2]) : length - 1n;
	if (match[2] && end < start) return null;
	if (start >= length) return "unsatisfied";
	return {
		start: Number(start),
		end: Number(end >= length ? length - 1n : end),
	};
}

export async function servePdf(
	request: Request,
	id: string,
	directory?: string,
): Promise<Response> {
	const headers = new Headers({
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	const errorResponse = (status: number, message: string): Response => {
		headers.set("Content-Type", "text/plain; charset=utf-8");
		headers.delete("Content-Disposition");
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
		const pdf = await findPdf(id, directory);
		if (!pdf) return errorResponse(404, "PDF not found.");
		// Open before sending headers. Reject a final symlink if the file changed.
		const file = await open(
			pdf.path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		let streamOwnsFile = false;
		try {
			const info = await file.stat();
			if (!info.isFile()) return errorResponse(404, "PDF not found.");
			const size = info.size;
			headers.set("Accept-Ranges", "bytes");
			headers.set("Content-Type", "application/pdf");
			headers.set("Content-Disposition", `inline; filename="${id}.pdf"`);
			// Range applies only to GET. Without validators, If-Range needs a full response.
			const range =
				request.method === "GET" && !request.headers.has("If-Range")
					? parseRange(request.headers.get("Range"), size)
					: null;
			if (range === "unsatisfied") {
				headers.set("Content-Range", `bytes */${size}`);
				headers.set("Content-Length", "0");
				return new Response(null, { status: 416, headers });
			}
			const length = range ? range.end - range.start + 1 : size;
			headers.set("Content-Length", String(length));
			if (range)
				headers.set(
					"Content-Range",
					`bytes ${range.start}-${range.end}/${size}`,
				);
			const status = range ? 206 : 200;
			if (request.method === "HEAD" || length === 0)
				return new Response(null, { status, headers });
			const source = Readable.toWeb(file.createReadStream(range ?? {}), {
				strategy: {
					highWaterMark: 64 * 1024,
					size: (chunk: Uint8Array) => chunk.byteLength,
				},
			}) as ReadableStream<Uint8Array>;
			const reader = source.getReader();
			const body = new ReadableStream<Uint8Array>({
				async pull(controller) {
					try {
						const chunk = await reader.read();
						if (chunk.done) controller.close();
						else controller.enqueue(chunk.value);
					} catch {
						controller.error(new Error("Cannot read the PDF."));
					}
				},
				async cancel() {
					await reader.cancel();
				},
			});
			streamOwnsFile = true;
			return new Response(body, { status, headers });
		} finally {
			if (!streamOwnsFile) await file.close();
		}
	} catch {
		return errorResponse(500, "Cannot read the PDF.");
	}
}
