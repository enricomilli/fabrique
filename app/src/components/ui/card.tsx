import { cn } from "cn";
import type { ComponentProps } from "react";

function Card({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn(
				"rounded-lg border bg-card text-card-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn("flex flex-col gap-2 p-5", className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-5 pb-5", className)}
			{...props}
		/>
	);
}

export { Card, CardHeader, CardContent };
