import { z } from "zod";

export const feedbackSchema = z.object({
	email: z
		.string({ error: "invalid_email" })
		.trim()
		.email("invalid_email")
		.max(254, "invalid_email"),
	message: z
		.string({ error: "invalid_message" })
		.trim()
		.min(1, "invalid_message")
		.max(2000, "invalid_message"),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export type FeedbackResult =
	| { success: true }
	| { success: false; error: "unavailable" | "send_failed" | "invalid_input" };
