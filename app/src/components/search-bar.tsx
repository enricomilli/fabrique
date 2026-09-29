import { Button } from "#/components/ui/button";
import { DrawerTrigger } from "#/components/ui/drawer";
import { Input } from "#/components/ui/input";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { FunnelIcon, SearchIcon, XIcon } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

type SearchBarProps = {
	initialQuery?: string;
	documentCount?: number;
	onSearch: (query: string) => void;
};

export function SearchBar({
	initialQuery = "",
	documentCount,
	onSearch,
}: SearchBarProps) {
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState(initialQuery);
	const [invalid, setInvalid] = useState(false);
	const count =
		documentCount === undefined
			? undefined
			: new Intl.NumberFormat(getLocale()).format(documentCount);
	const collection =
		count === undefined
			? m.search_collection()
			: documentCount === 1
				? m.search_collection_single({ count })
				: m.search_collection_count({ count });

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedQuery = query.trim();
		if (!trimmedQuery) {
			setInvalid(true);
			input.current?.focus();
			return;
		}
		setInvalid(false);
		setQuery(trimmedQuery);
		onSearch(trimmedQuery);
	}

	return (
		<section
			className="px-6 py-10 sm:pt-20 sm:pb-8"
			aria-labelledby={`${id}-title`}
		>
			<div className="mx-auto w-full max-w-5xl">
				<h1
					id={`${id}-title`}
					className="text-balance text-center font-heading text-3xl leading-snug "
				>
					{m.search_title()}
				</h1>
				<search aria-labelledby={`${id}-title`} className="mt-10">
					<form onSubmit={handleSubmit} noValidate>
						<label htmlFor={`${id}-query`} className="sr-only">
							{m.search_label()}
						</label>
						<div className="flex items-center gap-1 border border-input bg-background pe-1 focus-within:border-ring">
							<div className="flex min-w-0 flex-1 items-center gap-3 ps-3">
								<Input
									ref={input}
									id={`${id}-query`}
									name="q"
									type="search"
									enterKeyHint="search"
									required
									value={query}
									placeholder={m.search_placeholder()}
									aria-invalid={invalid || undefined}
									aria-describedby={
										invalid
											? `${id}-error ${id}-collection`
											: `${id}-collection`
									}
									className="h-12 rounded-none border-0 bg-transparent px-0 font-heading text-base shadow-none focus-visible:ring-0 aria-invalid:ring-0 md:text-base dark:bg-transparent [&::-webkit-search-cancel-button]:appearance-none"
									onChange={(event) => {
										setQuery(event.target.value);
										setInvalid(false);
									}}
								/>
								{query && (
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="me-1 text-muted-foreground transition-colors hover:text-foreground"
										aria-label={m.search_clear()}
										title={m.search_clear()}
										onClick={() => {
											setQuery("");
											setInvalid(false);
											input.current?.focus();
										}}
									>
										<XIcon aria-hidden="true" className="size-4" />
									</Button>
								)}
							</div>
							<DrawerTrigger
								render={<Button variant="ghost" size="icon" />}
								type="button"
								className="size-10 rounded-none aria-expanded:bg-accent"
								aria-label={m.documents_controls()}
								title={m.documents_controls()}
							>
								<FunnelIcon
									aria-hidden="true"
									className="size-5"
									strokeWidth={1.75}
								/>
							</DrawerTrigger>

							<Button
								type="submit"
								size="icon"
								className="size-10 rounded-none"
								aria-label={m.search_submit()}
								title={m.search_submit()}
							>
								<SearchIcon
									aria-hidden="true"
									className="size-5"
									strokeWidth={1.75}
								/>
							</Button>
						</div>
						<p
							id={`${id}-error`}
							role={invalid ? "alert" : undefined}
							aria-hidden={!invalid}
							className={`mt-2 text-sm text-destructive ${invalid ? "visible" : "invisible"}`}
						>
							{m.search_required()}
						</p>
					</form>
				</search>
				<p id={`${id}-collection`} className="sr-only">
					{collection}
				</p>
			</div>
		</section>
	);
}
