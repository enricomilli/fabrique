import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/integrations/better-auth/auth-client";
import { getSession } from "#/lib/fns/session-fns";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		if (await getSession()) throw redirect({ to: "/" });
	},
	component: LoginPage,
});

function LoginPage() {
	const [signUp, setSignUp] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<"failed" | "denied" | null>(null);
	const submitting = useRef(false);
	const router = useRouter();
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting.current) return;
		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		submitting.current = true;
		setPending(true);
		setError(null);
		try {
			const result = signUp
				? await authClient.signUp.email({
						email,
						password,
						name: String(data.get("name") ?? "").trim(),
					})
				: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(signUp && result.error.status === 403 ? "denied" : "failed");
				return;
			}
			await router.invalidate();
			await router.navigate({ to: "/" });
		} catch {
			setError("failed");
		} finally {
			submitting.current = false;
			setPending(false);
		}
	}
	return (
		<div className="min-h-screen">
			<AppHeader showFeedback={false} />
			<main className="mx-auto max-w-md px-6 py-12">
				<h1 className="font-heading text-2xl">
					{signUp ? m.auth_sign_up() : m.auth_sign_in()}
				</h1>
				<form onSubmit={submit} aria-busy={pending} className="mt-8 space-y-6">
					{signUp && (
						<div className="space-y-2">
							<Label htmlFor="auth-name">{m.auth_name()}</Label>
							<Input
								className="min-h-10"
								id="auth-name"
								name="name"
								autoComplete="name"
								required
								maxLength={200}
								disabled={pending}
							/>
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="auth-email">{m.auth_email()}</Label>
						<Input
							className="min-h-10"
							id="auth-email"
							name="email"
							type="email"
							autoComplete="email"
							required
							disabled={pending}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="auth-password">{m.auth_password()}</Label>
						<Input
							className="min-h-10"
							id="auth-password"
							name="password"
							type="password"
							autoComplete={signUp ? "new-password" : "current-password"}
							minLength={signUp ? 8 : undefined}
							required
							disabled={pending}
							aria-describedby={signUp ? "password-hint" : undefined}
						/>
						{signUp && (
							<p id="password-hint" className="text-sm text-muted-foreground">
								{m.auth_password_hint()}
							</p>
						)}
					</div>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error === "denied"
								? m.auth_sign_up_denied()
								: signUp
									? m.auth_sign_up_error()
									: m.auth_sign_in_error()}
						</p>
					)}
					<Button type="submit" className="min-h-10 w-full" disabled={pending}>
						{pending
							? m.auth_wait()
							: signUp
								? m.auth_sign_up()
								: m.auth_sign_in()}
					</Button>
				</form>
				<Button
					type="button"
					variant="link"
					className="mt-6 min-h-10 whitespace-normal"
					disabled={pending}
					onClick={() => {
						setSignUp(!signUp);
						setError(null);
					}}
				>
					{signUp ? m.auth_have_account() : m.auth_create_account()}
				</Button>
			</main>
		</div>
	);
}
