CREATE TABLE "documents" (
	"id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;