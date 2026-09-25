import process from "node:process";
import {
	type FeedbackInput,
	type FeedbackResult,
	feedbackSchema,
} from "./feedback-schema.ts";

type DiscordFeedbackPayload = {
	username: string;
	allowed_mentions: { parse: string[] };
	embeds: Array<{
		title: string;
		description: string;
		timestamp: string;
		fields: Array<{ name: string; value: string; inline: boolean }>;
	}>;
};

export function createDiscordFeedbackPayload(
	{ email, message }: FeedbackInput,
	sentAt: Date = new Date(),
): DiscordFeedbackPayload {
	return {
		username: "Fabrique Feedback",
		allowed_mentions: { parse: [] },
		embeds: [
			{
				title: "New product feedback",
				description: message,
				timestamp: sentAt.toISOString(),
				fields: [{ name: "Email", value: email, inline: true }],
			},
		],
	};
}

export async function sendFeedback(
	input: unknown,
	fetcher: typeof fetch = fetch,
): Promise<FeedbackResult> {
	const parsed = feedbackSchema.safeParse(input);
	if (!parsed.success) {
		return { success: false, error: "invalid_input" };
	}

	const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL?.trim();
	if (!webhookUrl) {
		return { success: false, error: "unavailable" };
	}

	try {
		const response = await fetcher(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(createDiscordFeedbackPayload(parsed.data)),
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) {
			return { success: false, error: "send_failed" };
		}
		return { success: true };
	} catch {
		return { success: false, error: "send_failed" };
	}
}
