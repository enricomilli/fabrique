export type DocumentLogFields = Record<
	string,
	string | number | boolean | null | undefined
>;

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function safeMessage(message: string): string {
	let result = message.replace(
		/(postgres(?:ql)?|rediss?|https?):\/\/[^/@\s]+@/g,
		"$1://[redacted]@",
	);
	for (const name of [
		"POSTGRES_PASSWORD",
		"BETTER_AUTH_SECRET",
		"S3_SECRET_ACCESS_KEY",
		"S3_ACCESS_KEY_ID",
	]) {
		const secret = process.env[name];
		if (secret) result = result.replaceAll(secret, "[redacted]");
	}
	return result.slice(0, 1000);
}

export function logDocumentEvent(
	event: string,
	fields: DocumentLogFields = {},
): void {
	console.info(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: "info",
			event,
			...fields,
		}),
	);
}

export function logDocumentError(
	event: string,
	error: unknown,
	fields: DocumentLogFields = {},
): void {
	const details = record(error);
	const metadata = record(details?.$metadata);
	const response = record(details?.$response);
	const headers = record(response?.headers);
	const cause = record(details?.cause);
	let errorMessage = error instanceof Error ? error.message : "Unknown error.";
	if (error instanceof SyntaxError) errorMessage = "The JSON value is invalid.";
	if (details && ("query" in details || "params" in details)) {
		errorMessage = "The database query failed.";
	}
	console.error(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: "error",
			event,
			...fields,
			errorName: error instanceof Error ? error.name : "UnknownError",
			errorMessage: safeMessage(errorMessage),
			errorCode: typeof details?.code === "string" ? details.code : undefined,
			causeCode: typeof cause?.code === "string" ? cause.code : undefined,
			httpStatusCode:
				typeof metadata?.httpStatusCode === "number"
					? metadata.httpStatusCode
					: typeof response?.statusCode === "number"
						? response.statusCode
						: undefined,
			storageRequestId:
				typeof metadata?.requestId === "string"
					? metadata.requestId
					: undefined,
			attempts:
				typeof metadata?.attempts === "number" ? metadata.attempts : undefined,
			server: typeof headers?.server === "string" ? headers.server : undefined,
			contentType:
				typeof headers?.["content-type"] === "string"
					? headers["content-type"]
					: undefined,
		}),
	);
}
