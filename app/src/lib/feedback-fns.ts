import { createServerFn } from "@tanstack/react-start";
import type { FeedbackInput, FeedbackResult } from "./feedback-schema";

export const submitFeedback = createServerFn({ method: "POST" })
	// The handler validates input so invalid requests return a result, not an exception.
	.inputValidator((input: FeedbackInput) => input)
	.handler(async ({ data }): Promise<FeedbackResult> => {
		const { sendFeedback } = await import("./feedback.server");
		return sendFeedback(data);
	});
