import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { submitFeedback } from "#/lib/feedback-fns";
import { feedbackSubmissionSchema } from "#/lib/feedback-schema";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_protected/feedback")({
	head: () => ({ meta: [{ title: m.feedback_page_title() }] }),
	component: FeedbackPage,
});

type SubmissionStatus =
	| "idle"
	| "pending"
	| "success"
	| "unavailable"
	| "send_failed"
	| "invalid_input";

function FeedbackPage() {
	const [message, setMessage] = useState("");
	const [messageError, setMessageError] = useState(false);
	const [status, setStatus] = useState<SubmissionStatus>("idle");
	const messageInput = useRef<HTMLTextAreaElement>(null);
	const submitting = useRef(false);
	const pending = status === "pending";

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting.current) return;

		const parsed = feedbackSubmissionSchema.safeParse({ message });
		if (!parsed.success) {
			setMessageError(true);
			setStatus("idle");
			messageInput.current?.focus();
			return;
		}

		setMessageError(false);
		submitting.current = true;
		setStatus("pending");
		try {
			const result = await submitFeedback({ data: parsed.data });
			if (result.success) {
				setMessage("");
				setStatus("success");
			} else {
				setStatus(result.error);
			}
		} catch {
			setStatus("send_failed");
		} finally {
			submitting.current = false;
		}
	}

	const submissionError =
		status === "unavailable"
			? m.feedback_unavailable()
			: status === "send_failed"
				? m.feedback_send_failed()
				: status === "invalid_input"
					? m.feedback_invalid_input()
					: null;

	return (
		<div className="min-h-screen">
			<AppHeader />
			<main className="mx-auto w-full max-w-xl px-6 py-10">
				<h1 className="mt-6 font-heading text-2xl">{m.give_feedback()}</h1>
				<p className="mt-2 text-muted-foreground">{m.feedback_description()}</p>
				<form
					className="mt-8 space-y-6"
					noValidate
					onSubmit={handleSubmit}
					aria-busy={pending}
				>
					<div className="space-y-2">
						<Label htmlFor="feedback-message">{m.feedback_message()}</Label>
						<Textarea
							ref={messageInput}
							id="feedback-message"
							name="message"
							className="min-h-40 resize-y"
							required
							maxLength={2000}
							readOnly={pending}
							value={message}
							aria-invalid={messageError || undefined}
							aria-describedby={
								messageError
									? "feedback-message-hint feedback-message-error"
									: "feedback-message-hint"
							}
							onChange={(event) => {
								setMessage(event.target.value);
								setMessageError(false);
								setStatus("idle");
							}}
						/>
						<p
							id="feedback-message-hint"
							className="text-sm text-muted-foreground"
						>
							{m.feedback_message_hint()}
						</p>
						{messageError && (
							<p
								id="feedback-message-error"
								className="text-sm text-destructive"
							>
								{m.feedback_invalid_message()}
							</p>
						)}
					</div>
					<Button type="submit" className="ml-auto" disabled={pending}>
						{pending ? m.feedback_sending() : m.feedback_submit()}
					</Button>
					<output className="block text-sm" aria-live="polite">
						{status === "success" ? m.feedback_success() : ""}
					</output>
					{submissionError && (
						<p role="alert" className="text-sm text-destructive">
							{submissionError}
						</p>
					)}
				</form>
			</main>
		</div>
	);
}
