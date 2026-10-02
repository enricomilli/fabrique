import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { MAX_PDF_BYTES } from "#/lib/upload-limits";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_protected/documents/new")({
	component: UploadPage,
});

type UploadError =
	| "invalid_pdf"
	| "too_large"
	| "upload_failed"
	| "unauthorized"
	| "queue_uncertain";

function UploadPage() {
	const navigate = Route.useNavigate();
	const request = useRef<XMLHttpRequest | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [isPublic, setIsPublic] = useState(false);
	const [pending, setPending] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<UploadError | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	useEffect(
		() => () => {
			const xhr = request.current;
			request.current = null;
			xhr?.abort();
		},
		[],
	);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (request.current) return;
		setError(null);
		setSavedId(null);
		if (
			!file?.name.toLowerCase().endsWith(".pdf") ||
			(file.type !== "" && file.type !== "application/pdf")
		) {
			setError("invalid_pdf");
			fileInput.current?.focus();
			return;
		}
		if (file.size > MAX_PDF_BYTES) {
			setError("too_large");
			fileInput.current?.focus();
			return;
		}
		const xhr = new XMLHttpRequest();
		request.current = xhr;
		setPending(true);
		setProgress(0);
		const fail = (reason: UploadError) => {
			if (request.current !== xhr) return;
			request.current = null;
			setPending(false);
			setError(reason);
		};
		xhr.upload.onprogress = (event) => {
			if (request.current === xhr)
				setProgress(
					event.lengthComputable
						? Math.min(100, Math.floor((event.loaded / event.total) * 100))
						: null,
				);
		};
		xhr.onerror = () => fail("upload_failed");
		xhr.onabort = () => fail("upload_failed");
		xhr.onload = () => {
			if (request.current !== xhr) return;
			let body: unknown;
			try {
				body = JSON.parse(xhr.responseText);
			} catch {
				fail("upload_failed");
				return;
			}
			const id =
				typeof body === "object" &&
				body !== null &&
				"id" in body &&
				typeof body.id === "string"
					? body.id
					: null;
			if (xhr.status === 201 && id) {
				request.current = null;
				setPending(false);
				void navigate({
					to: "/documents/$documentId",
					params: { documentId: id },
				});
				return;
			}
			if (xhr.status === 503 && id) {
				setSavedId(id);
				fail("queue_uncertain");
				return;
			}
			const code =
				typeof body === "object" && body !== null && "error" in body
					? body.error
					: null;
			fail(
				code === "invalid_pdf" ||
					code === "too_large" ||
					code === "unauthorized"
					? code
					: "upload_failed",
			);
		};
		try {
			xhr.open(
				"POST",
				`/api/documents?public=${isPublic}&filename=${encodeURIComponent(file.name)}`,
			);
			xhr.setRequestHeader("Content-Type", "application/pdf");
			xhr.send(file);
		} catch {
			fail("upload_failed");
		}
	}
	const errorMessage =
		error === "invalid_pdf"
			? m.upload_invalid_pdf()
			: error === "too_large"
				? m.upload_too_large()
				: error === "unauthorized"
					? m.upload_unauthorized()
					: error === "queue_uncertain"
						? m.upload_queue_uncertain()
						: error
							? m.upload_failed()
							: null;
	return (
		<div className="min-h-screen">
			<AppHeader />
			<main className="mx-auto w-full max-w-xl px-6 py-10">
				<h1 className="mt-6 font-heading text-2xl">{m.upload_page_title()}</h1>
				<p className="mt-3 text-muted-foreground">{m.upload_description()}</p>
				<form onSubmit={submit} aria-busy={pending} className="mt-8 space-y-8">
					<div className="space-y-3">
						<Label htmlFor="document-file" className="sr-only">
							{m.upload_file()}
						</Label>
						<input
							ref={fileInput}
							id="document-file"
							name="file"
							type="file"
							accept=".pdf,application/pdf"
							required
							disabled={pending}
							aria-invalid={
								error === "invalid_pdf" || error === "too_large" || undefined
							}
							aria-describedby={`upload-hint${errorMessage ? " upload-error" : ""}`}
							className="block w-full min-w-0 border border-dashed p-5 text-sm file:me-4 file:min-h-10 file:rounded-lg file:border file:bg-background file:px-3 file:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
							onChange={(event) => {
								setFile(event.target.files?.[0] ?? null);
								setError(null);
								setSavedId(null);
								setProgress(null);
							}}
						/>
						<p id="upload-hint" className="text-sm text-muted-foreground">
							{m.upload_hint()}
						</p>
					</div>
					<div className="flex items-center justify-between gap-6 pt-12">
						<div className="space-y-2">
							<Label htmlFor="document-public">{m.upload_public()}</Label>
							<p id="public-hint" className="text-sm text-muted-foreground">
								{m.upload_private_hint()}
							</p>
						</div>
						<Switch
							id="document-public"
							checked={isPublic}
							onCheckedChange={setIsPublic}
							disabled={pending}
							aria-describedby="public-hint"
						/>
					</div>
					{pending && (
						<div className="space-y-2">
							<label htmlFor="upload-progress" className="text-sm">
								{m.upload_progress()}
							</label>
							<progress
								id="upload-progress"
								className="block h-2 w-full"
								max={100}
								value={progress ?? undefined}
							/>
							<output className="block text-sm tabular-nums text-muted-foreground">
								{progress === 100
									? m.upload_finishing()
									: progress === null
										? m.upload_progress()
										: m.upload_percent({ percent: String(progress) })}
							</output>
						</div>
					)}
					{errorMessage && (
						<div id="upload-error" role="alert" className="space-y-3 text-sm">
							<p className="text-destructive">{errorMessage}</p>
							{savedId && (
								<Link
									to="/documents/$documentId"
									params={{ documentId: savedId }}
									className="underline underline-offset-4"
								>
									{m.upload_view_saved()}
								</Link>
							)}
							{error === "unauthorized" && (
								<Link to="/login" className="underline underline-offset-4">
									{m.auth_sign_in()}
								</Link>
							)}
						</div>
					)}
					<div className="flex flex-wrap items-center justify-between gap-4 pt-4">
						<Link
							to="/"
							className="inline-flex min-h-10 items-center text-sm underline underline-offset-4"
						>
							{m.upload_back()}
						</Link>
						<Button
							type="submit"
							className="min-h-10"
							disabled={pending || !file || savedId !== null}
						>
							{pending ? m.upload_progress() : m.upload_submit()}
						</Button>
					</div>
				</form>
			</main>
		</div>
	);
}
