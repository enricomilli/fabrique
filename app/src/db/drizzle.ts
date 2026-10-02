import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "#/env.ts";
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, {
	relations: { ...defineRelations(schema), ...schema.authRelations },
});
export type Database = typeof db;
