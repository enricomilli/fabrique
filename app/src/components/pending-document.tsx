import { Link } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	CheckIcon,
	ChevronDownIcon,
	Loader,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "#/components/app-header";
import { Button } from "#/components/ui/button";
import type { FicheCall, NoteIteration } from "#/lib/docs.schema";
import type { DocumentDetail } from "#/lib/docs.server";
import { m } from "#/paraglide/messages";

export function PendingDocument({ document }: { document: DocumentDetail }) {
	const data = document.generationData;
	const stages = [
		{ label: "1", title: m.generation_stage_1() },
		{ label: "2a", title: m.generation_stage_2a() },
		{ label: "2b", title: m.generation_stage_2b() },
		{ label: "2c", title: m.generation_stage_2c() },
		{ label: "2d", title: m.generation_stage_2d() },
		{ label: "3a", title: m.generation_stage_3a() },
		{ label: "3b", title: m.generation_stage_3b() },
	].map((stage) => {
		const calls = data?.fiche.steps
			.filter((step) => step.label === stage.label)
			.flatMap((step) => step.calls)
			.filter((call) => !call.meta.discarded && call.output.trim());
		return { ...stage, call: calls?.at(-1) };
	});
	const ficheReady = Boolean(data?.fiche.fiche_md.trim() || document.hasFiche);
	const noteReady = Boolean(data?.note.note_md.trim() || document.hasNote);
	const prepared = Boolean(data?.note.prompt.trim());
	const iterations =
		data?.note.iterations.filter(
			(iteration) =>
				iteration.kind === "root" &&
				iteration.output.trim() &&
				iteration.finish &&
				iteration.status >= 200 &&
				iteration.status < 300,
		) ?? [];
	const latest = iterations.at(-1);
	const parallelStages =
		!ficheReady && Boolean(stages.find((stage) => stage.label === "2d")?.call);
	const activeStages =
		!data || ficheReady
			? []
			: stages.filter(
					(stage) =>
						!stage.call &&
						(parallelStages
							? stage.label === "3a" || stage.label === "3b"
							: stage === stages.find((candidate) => !candidate.call)),
				);
	const completedStages = stages.filter((stage) => stage.call);
	const activityCount =
		completedStages.length + iterations.length + Number(ficheReady);
	const feedRef = useRef<HTMLElement>(null);
	const previousCount = useRef(activityCount);
	const [newActivity, setNewActivity] = useState(false);
	useEffect(() => {
		if (
			activityCount > previousCount.current &&
			(feedRef.current?.scrollTop ?? 0) > 32
		) {
			setNewActivity(true);
		}
		previousCount.current = activityCount;
	}, [activityCount]);
	const ficheStepsCompleted = stages.every((stage) => Boolean(stage.call));
	const noteActive = ficheReady && !noteReady;
	const [ficheExpanded, setFicheExpanded] = useState(!ficheStepsCompleted);
	const [noteExpanded, setNoteExpanded] = useState(noteActive);
	useEffect(() => {
		setFicheExpanded(!ficheStepsCompleted);
	}, [ficheStepsCompleted]);
	useEffect(() => {
		setNoteExpanded(noteActive);
	}, [noteActive]);
	return (
		<div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
			<AppHeader alwaysShowBorder />
			<main className="grid min-h-0 w-full flex-1 items-stretch lg:grid-cols-[minmax(0,1fr)_320px]">
				<aside
					className="order-first flex flex-col gap-6 border-b px-6 py-6 sm:px-8 lg:order-last lg:overflow-y-auto lg:border-b-0 lg:border-s lg:px-6"
					aria-label={m.generation_progress()}
				>
					<h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
						{m.generation_progress()}
					</h2>
					<section>
						<h3>
							<button
								type="button"
								aria-expanded={ficheExpanded}
								aria-controls="fiche-generation-steps"
								onClick={() => setFicheExpanded((expanded) => !expanded)}
								className="flex w-full items-center gap-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
							>
								{ficheStepsCompleted ? (
									<CheckIcon aria-hidden="true" className="size-4 shrink-0" />
								) : (
									<Loader
										aria-hidden="true"
										className="size-4 shrink-0 motion-safe:animate-spin"
									/>
								)}
								<span className="flex-1 text-[15px]">{m.document_fiche()}</span>
								<span className="sr-only">
									{ficheStepsCompleted
										? m.generation_completed()
										: m.generation_active()}
								</span>
								<ChevronDownIcon
									aria-hidden="true"
									className={`size-4 shrink-0 text-muted-foreground ${ficheExpanded ? "rotate-180" : ""}`}
								/>
							</button>
						</h3>
						<div id="fiche-generation-steps" hidden={!ficheExpanded}>
							<ol className="mt-5 space-y-4">
								{stages.map((stage) => {
									const active = activeStages.includes(stage);
									return (
										<li
											key={stage.label}
											className="flex items-start gap-3 text-sm"
										>
											<span
												className={`mt-0.5 ${active ? "text-amber-700 dark:text-amber-300" : stage.call ? "text-foreground" : "text-muted-foreground"}`}
											>
												{stage.call ? (
													<CheckIcon aria-hidden="true" className="size-4" />
												) : active ? (
													<Loader
														aria-hidden="true"
														className="size-4 motion-safe:animate-spin"
													/>
												) : (
													<span
														aria-hidden="true"
														className="block size-4 rounded-full border"
													/>
												)}
											</span>
											<span className="min-w-0 flex-1">
												<span className="me-2 text-muted-foreground">
													{stage.label}
												</span>
												{stage.title}
												<span className="sr-only">
													{" "}
													—{" "}
													{stage.call
														? m.generation_completed()
														: active
															? m.generation_active()
															: m.generation_waiting()}
												</span>
											</span>
											{stage.call && (
												<span className="shrink-0 tabular-nums text-muted-foreground">
													{m.generation_duration({
														seconds: String(
															Math.round(stage.call.meta.elapsed_s),
														),
													})}
												</span>
											)}
										</li>
									);
								})}
							</ol>
							{document.hasFiche && (
								<Link
									to="/documents/$documentId/fiche"
									params={{ documentId: document.id }}
									className="mt-5 inline-flex text-sm underline underline-offset-4"
								>
									{m.document_read_fiche()}
								</Link>
							)}
						</div>
					</section>
					<section>
						<h3>
							<button
								type="button"
								aria-expanded={noteExpanded}
								aria-controls="note-generation-steps"
								onClick={() => setNoteExpanded((expanded) => !expanded)}
								className="flex w-full items-center gap-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
							>
								{noteReady ? (
									<CheckIcon aria-hidden="true" className="size-4 shrink-0" />
								) : ficheReady ? (
									<Loader
										aria-hidden="true"
										className="size-4 shrink-0 motion-safe:animate-spin"
									/>
								) : (
									<span
										aria-hidden="true"
										className="size-4 shrink-0 rounded-full border text-muted-foreground"
									/>
								)}
								<span className="flex-1 text-[15px]">{m.document_note()}</span>
								<span className="sr-only">
									{noteReady
										? m.generation_completed()
										: ficheReady
											? m.generation_active()
											: m.generation_waiting()}
								</span>
								<ChevronDownIcon
									aria-hidden="true"
									className={`size-4 shrink-0 text-muted-foreground ${noteExpanded ? "rotate-180" : ""}`}
								/>
							</button>
						</h3>
						<div
							id="note-generation-steps"
							hidden={!noteExpanded}
							className="ms-2 mt-4 space-y-3 border-s ps-5"
						>
							<p className="text-sm">
								{!ficheReady
									? m.generation_waiting()
									: prepared
										? m.generation_note_prepared()
										: m.generation_note_preparing()}
							</p>
							<p className="text-sm text-muted-foreground">
								{m.generation_iterations({ count: String(iterations.length) })}
							</p>
							{noteReady && (
								<p className="text-sm">{m.generation_note_ready()}</p>
							)}
							{document.hasNote && (
								<Link
									to="/documents/$documentId/note"
									params={{ documentId: document.id }}
									className="inline-flex text-sm underline underline-offset-4"
								>
									{m.document_read_note()}
								</Link>
							)}
						</div>
					</section>
					{document.pdfUrl && (
						<div className="mt-auto">
							<Button
								variant="outline"
								nativeButton={false}
								className="w-full"
								render={
									<a
										href={document.pdfUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										{m.document_read_pdf()}
									</a>
								}
							>
								{m.document_read_pdf()}
							</Button>
						</div>
					)}
				</aside>
				<section
					className="flex min-h-0 min-w-0 flex-col px-6 py-6 sm:px-8"
					aria-label={m.generation_activity()}
				>
					<header className="mb-6">
						<Link
							to="/"
							className="inline-flex items-center gap-2 text-sm text-muted-foreground"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-4" />
							{m.document_back()}
						</Link>
						<h1 className="mt-5 text-balance break-words font-heading text-lg leading-relaxed">
							{document.title}
						</h1>
						<p className="mt-3 text-sm text-muted-foreground">
							{m.document_generating()}
						</p>
					</header>
					<div className="mb-5 flex shrink-0 items-center justify-between gap-4">
						<h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							{m.generation_activity()}
						</h2>
						{newActivity && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									feedRef.current?.scrollTo({ top: 0 });
									setNewActivity(false);
								}}
							>
								{m.generation_new_activity()}
							</Button>
						)}
					</div>
					<section
						ref={feedRef}
						aria-label={m.generation_activity()}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the activity feed.
						tabIndex={0}
						onScroll={(event) => {
							if (event.currentTarget.scrollTop <= 32) setNewActivity(false);
						}}
						className="min-h-0 space-y-4 focus-visible:outline-2 focus-visible:outline-ring lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pe-2"
					>
						{activeStages.map((stage) => (
							<article
								key={`active:${stage.label}`}
								className="border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
							>
								<h3 className="flex items-center gap-3 text-sm font-medium">
									<Loader
										aria-hidden="true"
										className="size-4 shrink-0 motion-safe:animate-spin"
									/>
									{stage.title}
								</h3>
								<p className="mt-4 text-sm">{m.generation_active()}</p>
							</article>
						))}
						{activeStages.length === 0 && (
							<article className="border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
								<h3 className="flex items-center gap-3 text-sm font-medium">
									<Loader
										aria-hidden="true"
										className="size-4 shrink-0 motion-safe:animate-spin"
									/>
									{prepared && !noteReady
										? m.generation_current_iteration({
												number: String((latest?.n ?? 0) + 1),
											})
										: m.generation_active()}
								</h3>
								<p className="mt-4 text-sm leading-relaxed">
									{!data
										? m.document_queued()
										: noteReady
											? m.generation_finishing()
											: prepared
												? m.generation_note_work()
												: ficheReady
													? m.generation_note_preparing()
													: m.generation_fiche_final()}
								</p>
							</article>
						)}
						{[...iterations].reverse().map((iteration) => (
							<IterationCard
								key={`${iteration.file}:${iteration.n}`}
								iteration={iteration}
							/>
						))}
						{ficheReady && (
							<FicheActivityCard
								key="fiche:final"
								title={m.document_fiche()}
								markdown={document.ficheMarkdown}
								documentId={document.id}
							/>
						)}
						{[...completedStages].reverse().map((stage) => (
							<FicheActivityCard
								key={`fiche:${stage.label}`}
								title={stage.title}
								call={stage.call}
							/>
						))}
					</section>
				</section>
			</main>
		</div>
	);
}

function IterationCard({ iteration }: { iteration: NoteIteration }) {
	return (
		<details className="group border bg-background">
			<summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-5 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
				<CheckIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className="flex-1 font-medium">
					{m.generation_iteration({ number: String(iteration.n) })}
				</span>
				<span className="tabular-nums text-muted-foreground">
					{m.generation_duration({
						seconds: String(Math.round(iteration.elapsed_s)),
					})}
				</span>
				<ChevronDownIcon
					aria-hidden="true"
					className="size-4 shrink-0 group-open:rotate-180"
				/>
			</summary>
			<div className="space-y-5 px-5 pb-5">
				{iteration.input.trim() && (
					<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
						{iteration.input}
					</p>
				)}
				<details className="border-t pt-4">
					<summary className="cursor-pointer text-sm text-muted-foreground">
						{m.generation_code()}
					</summary>
					<pre className="mt-3 max-h-96 overflow-auto bg-muted/50 p-4 text-xs leading-relaxed">
						<code>{iteration.output}</code>
					</pre>
				</details>
				{iteration.exec_stdout.trim() && (
					<details className="border-t pt-4">
						<summary className="cursor-pointer text-sm text-muted-foreground">
							{m.generation_output()}
						</summary>
						<pre className="mt-3 max-h-96 overflow-auto bg-muted/50 p-4 text-xs leading-relaxed">
							{iteration.exec_stdout}
						</pre>
					</details>
				)}
			</div>
		</details>
	);
}

function FicheActivityCard({
	title,
	call,
	markdown,
	documentId,
}: {
	title: string;
	call?: FicheCall;
	markdown?: string;
	documentId?: string;
}) {
	return (
		<details className="group border bg-background">
			<summary className="flex cursor-pointer list-none items-center gap-3 p-5 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
				<CheckIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className="min-w-0 flex-1 font-medium">{title}</span>
				{call && (
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{m.generation_duration({
							seconds: String(Math.round(call.meta.elapsed_s)),
						})}
					</span>
				)}
				<ChevronDownIcon
					aria-hidden="true"
					className="size-4 shrink-0 group-open:rotate-180"
				/>
			</summary>
			<div className="space-y-4 px-5 pb-5">
				<pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
					{markdown ?? call?.output}
				</pre>
				{documentId && (
					<Link
						to="/documents/$documentId/fiche"
						params={{ documentId }}
						className="inline-flex text-sm underline underline-offset-4"
					>
						{m.document_read_fiche()}
					</Link>
				)}
			</div>
		</details>
	);
}
