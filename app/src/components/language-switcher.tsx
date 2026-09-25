import { LanguagesIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { m } from "#/paraglide/messages";
import { getLocale, isLocale, setLocale } from "#/paraglide/runtime";

export function LanguageSwitcher() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" size="icon" />}
				aria-label={m.language_label()}
				title={m.language_label()}
			>
				<LanguagesIcon aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" aria-label={m.language_label()}>
				<DropdownMenuRadioGroup
					value={getLocale()}
					onValueChange={(value: unknown) => {
						if (isLocale(value)) void setLocale(value);
					}}
				>
					<DropdownMenuRadioItem value="en" lang="en">
						English
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="fr" lang="fr">
						Français
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
