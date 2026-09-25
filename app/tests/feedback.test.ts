import assert from "node:assert/strict";
import process from "node:process";
import { afterEach, test } from "node:test";
import { feedbackSchema } from "../src/lib/feedback-schema.ts";
import {
	createDiscordFeedbackPayload,
	sendFeedback,
} from "../src/lib/feedback.server.ts";

const input = { email: "user@example.com", message: "Useful app" };
const originalWebhook = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
const webhook = "https://discord.example.test/api/webhooks/test/secret";
const unexpectedFetch: typeof fetch = async () => {
	assert.fail("The transport must not run.");
};

afterEach(() => {
	if (originalWebhook === undefined) {
		delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
	} else {
		process.env.DISCORD_FEEDBACK_WEBHOOK_URL = originalWebhook;
	}
});

test("schema trims both fields and accepts the length limits", () => {
	assert.deepEqual(
		feedbackSchema.parse({ email: ` ${input.email} `, message: " Useful app\n" }),
		input,
	);
	const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
	assert.equal(email.length, 254);
	assert.equal(feedbackSchema.safeParse({ email, message: "x".repeat(2000) }).success, true);
	assert.equal(feedbackSchema.safeParse({ email: `a${email}`, message: "x" }).success, false);
});

test("schema uses field error codes for invalid values", () => {
	for (const email of [undefined, null, 123, "", "bad", "a".repeat(255)]) {
		const result = feedbackSchema.safeParse({ ...input, email });
		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.every((issue) => issue.message === "invalid_email"));
		}
	}
	for (const message of [undefined, null, 123, "", " \n ", "x".repeat(2001)]) {
		const result = feedbackSchema.safeParse({ ...input, message });
		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.every((issue) => issue.message === "invalid_message"));
		}
	}
});

test("invalid input returns a result before configuration or transport checks", async () => {
	delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
	for (const value of [undefined, null, [], {}, { ...input, message: " " }]) {
		assert.deepEqual(await sendFeedback(value, unexpectedFetch), {
			success: false,
			error: "invalid_input",
		});
	}
});

test("missing or blank configuration returns unavailable", async () => {
	for (const value of [undefined, "", "  "]) {
		if (value === undefined) delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
		else process.env.DISCORD_FEEDBACK_WEBHOOK_URL = value;
		assert.deepEqual(await sendFeedback(input, unexpectedFetch), {
			success: false,
			error: "unavailable",
		});
	}
});

test("payload preserves raw text and disables mentions", () => {
	const message = 'Hello "team"\n@everyone **feedback**';
	const sentAt = new Date("2026-01-01T00:00:00Z");
	const payload = createDiscordFeedbackPayload({ ...input, message }, sentAt);
	assert.deepEqual(payload.allowed_mentions, { parse: [] });
	assert.equal(payload.embeds[0].description, message);
	assert.equal(payload.embeds[0].timestamp, sentAt.toISOString());
	assert.deepEqual(payload.embeds[0].fields, [
		{ name: "Email", value: input.email, inline: true },
	]);
});

test("transport sends trimmed input as JSON with an eight-second timeout", async (context) => {
	process.env.DISCORD_FEEDBACK_WEBHOOK_URL = webhook;
	const signal = new AbortController().signal;
	const timeout = context.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
		assert.equal(milliseconds, 8000);
		return signal;
	});
	let calls = 0;
	const fetcher: typeof fetch = async (url, options) => {
		calls += 1;
		assert.equal(url, webhook);
		assert.equal(options?.method, "POST");
		assert.deepEqual(options?.headers, { "Content-Type": "application/json" });
		assert.equal(options?.signal, signal);
		assert.equal(typeof options?.body, "string");
		const payload: unknown = JSON.parse(String(options?.body));
		assert.ok(typeof payload === "object" && payload !== null && "embeds" in payload);
		assert.ok(Array.isArray(payload.embeds));
		assert.equal(payload.embeds[0].description, input.message);
		assert.equal(payload.embeds[0].fields[0].value, input.email);
		return new Response(null, { status: 204 });
	};
	assert.deepEqual(await sendFeedback({ email: ` ${input.email} `, message: ` ${input.message} ` }, fetcher), { success: true });
	assert.equal(calls, 1);
	assert.equal(timeout.mock.callCount(), 1);
});

test("Discord rejection, network errors, and timeouts return only send_failed", async () => {
	process.env.DISCORD_FEEDBACK_WEBHOOK_URL = webhook;
	const failures: Array<typeof fetch> = [
		async () => new Response(webhook, { status: 429 }),
		async () => new Response(webhook, { status: 500 }),
		async () => { throw new Error(webhook); },
		async () => { throw new DOMException(webhook, "TimeoutError"); },
	];
	for (const fetcher of failures) {
		assert.deepEqual(await sendFeedback(input, fetcher), {
			success: false,
			error: "send_failed",
		});
	}
});
