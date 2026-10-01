import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("Set DATABASE_URL before you run migrations.");
}

export default defineConfig({
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl,
	},
});
