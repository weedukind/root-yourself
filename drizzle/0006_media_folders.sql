CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_folders_parent_name_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name"),
	CONSTRAINT "media_folders_name_check" CHECK (length(trim("media_folders"."name")) > 0),
	CONSTRAINT "media_folders_not_own_parent_check" CHECK ("media_folders"."parent_id" IS DISTINCT FROM "media_folders"."id")
);
--> statement-breakpoint
-- Von Hand ergänzt: Vorhandene Bilder kommen in den Ordner „Unsortiert“ (nur wenn es welche gibt),
-- erst danach wird folder_id zur Pflicht.
ALTER TABLE "media" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
INSERT INTO "media_folders" ("name") SELECT 'Unsortiert' WHERE EXISTS (SELECT 1 FROM "media");--> statement-breakpoint
UPDATE "media" SET "folder_id" = (SELECT "id" FROM "media_folders" WHERE "parent_id" IS NULL AND "name" = 'Unsortiert');--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "folder_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_media_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder_id");