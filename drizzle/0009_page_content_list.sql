-- Der Inhaltsbereich einer Seite ist eine Liste: Jede Seite bekommt eine Liste als einziges Kind,
-- ihre bisherigen Kinder wandern in diese Liste. Die Ausrichtung der Seite geht auf die Liste
-- über, die Seite selbst hat keine Daten mehr. Geteilte Seiten (mehrere Versionen) teilen sich
-- auch die neue Liste.
CREATE TEMPORARY TABLE "page_content" ON COMMIT DROP AS
	SELECT "id" AS "page_id", "post_id", gen_random_uuid() AS "content_id",
		jsonb_build_object('orientation', coalesce("data"->>'orientation', 'vertical')) AS "data"
	FROM "elements" WHERE "type" = 'page';--> statement-breakpoint
INSERT INTO "elements" ("id", "post_id", "type", "data")
	SELECT "content_id", "post_id", 'list', "data" FROM "page_content";--> statement-breakpoint
-- Erst mit Position -1 einhängen (die Kinder der Seite belegen 0 bis n), dann die Kinder umhängen.
INSERT INTO "version_elements" ("version_id", "post_id", "element_id", "parent_element_id", "position")
	SELECT ve."version_id", ve."post_id", pc."content_id", pc."page_id", -1
	FROM "version_elements" ve JOIN "page_content" pc ON ve."element_id" = pc."page_id";--> statement-breakpoint
UPDATE "version_elements" ve SET "parent_element_id" = pc."content_id"
	FROM "page_content" pc
	WHERE ve."parent_element_id" = pc."page_id" AND ve."element_id" <> pc."content_id";--> statement-breakpoint
UPDATE "version_elements" ve SET "position" = 0
	FROM "page_content" pc WHERE ve."element_id" = pc."content_id";--> statement-breakpoint
UPDATE "elements" SET "data" = '{}'::jsonb WHERE "type" = 'page';
