import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-transparent bg-secondary text-secondary-foreground",
				outline: "border-border text-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Badge({
	className,
	variant,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
