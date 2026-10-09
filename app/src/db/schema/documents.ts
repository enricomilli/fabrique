import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Docs } from "#/lib/docs.schema";
import type { Reasoning } from "#/lib/reasoning.schema";
import { user } from "./auth";

export const documents = pgTable("documents", {
	id: text("id").primaryKey(),
	title: text("title"),
	data: jsonb("data").$type<Docs>(),
	reasoning: jsonb("reasoning").$type<Reasoning>(),
	generationCompleted: boolean("generation_completed").default(false).notNull(),
	public: boolean("public").default(false).notNull(),
	createdBy: text("created_by").references(() => user.id, {
		onDelete: "set null",
	}),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
