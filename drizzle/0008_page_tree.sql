-- Seitenlayout als Baum (Page → Listen/Slides → Elemente) statt Rows und Zellen.
-- Bestehende Posts werden nicht übernommen, sondern gelöscht (Versionen, Elemente, Weiterleitungen
-- fallen per Kaskade mit). Bilder, Ordner und Tags bleiben.
DELETE FROM "posts";--> statement-breakpoint
CREATE TABLE "version_elements" (
	"version_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"element_id" uuid NOT NULL,
	"parent_element_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "version_elements_pkey" PRIMARY KEY("version_id","element_id"),
	CONSTRAINT "version_elements_position_unique" UNIQUE NULLS NOT DISTINCT("version_id","parent_element_id","position")
);
--> statement-breakpoint
DROP TABLE "cell_elements" CASCADE;--> statement-breakpoint
DROP TABLE "cells" CASCADE;--> statement-breakpoint
DROP TABLE "rows" CASCADE;--> statement-breakpoint
ALTER TABLE "version_elements" ADD CONSTRAINT "version_elements_parent_fk" FOREIGN KEY ("version_id","parent_element_id") REFERENCES "public"."version_elements"("version_id","element_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_elements" ADD CONSTRAINT "version_elements_version_fk" FOREIGN KEY ("post_id","version_id") REFERENCES "public"."versions"("post_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_elements" ADD CONSTRAINT "version_elements_element_fk" FOREIGN KEY ("post_id","element_id") REFERENCES "public"."elements"("post_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "version_elements_root_unique" ON "version_elements" USING btree ("version_id") WHERE "version_elements"."parent_element_id" IS NULL;--> statement-breakpoint
CREATE INDEX "version_elements_element_idx" ON "version_elements" USING btree ("element_id");--> statement-breakpoint
-- Wie zuvor bei cell_elements: erst beim Commit prüfen, sonst scheitert das Löschen eines Posts,
-- weil eine Kaskade die Elemente vor ihren Verknüpfungen entfernt.
ALTER TABLE "version_elements" ALTER CONSTRAINT "version_elements_element_fk" DEFERRABLE INITIALLY DEFERRED;
