import { createServerFn } from "@tanstack/react-start";
import type { FeedbackResult, FeedbackSubmission } from "./feedback-schema";

export const submitFeedback = createServerFn({ method: "POST" })
	// The handler validates input so invalid requests return a result, not an exception.
	.inputValidator((input: FeedbackSubmission) => input)
	.handler(async ({ data }): Promise<FeedbackResult> => {
		const { ensureSession } = await import("./fns/session-fns");
		const session = await ensureSession();
		const { sendFeedback } = await import("./feedback.server");
		return sendFeedback({ ...data, email: session.user.email });
	});
