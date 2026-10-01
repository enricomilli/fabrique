import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "#/env.ts";
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });
export type Database = typeof db;
