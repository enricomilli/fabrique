ALTER TABLE "documents" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "generation_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "data" DROP NOT NULL;