CREATE TABLE "cell_elements" (
	"cell_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"element_id" uuid NOT NULL,
	CONSTRAINT "cell_elements_cell_id_position_pk" PRIMARY KEY("cell_id","position"),
	CONSTRAINT "cell_elements_version_element_unique" UNIQUE("version_id","element_id")
);
--> statement-breakpoint
CREATE TABLE "cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"row_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "cells_row_position_unique" UNIQUE("row_id","position"),
	CONSTRAINT "cells_version_id_unique" UNIQUE("version_id","id"),
	CONSTRAINT "cells_size_check" CHECK ("cells"."width" > 0 AND "cells"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"media_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elements_post_id_unique" UNIQUE("post_id","id"),
	CONSTRAINT "elements_media_check" CHECK (("elements"."type" = 'image') = ("elements"."media_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"r2_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "post_slug_redirects" (
	"old_slug" text PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"published_version_id" uuid,
	"first_published_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "posts_first_published_at_check" CHECK ("posts"."published_version_id" IS NULL OR "posts"."first_published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"grid_width" integer NOT NULL,
	"grid_height" integer NOT NULL,
	CONSTRAINT "rows_version_position_unique" UNIQUE("version_id","position"),
	CONSTRAINT "rows_version_id_unique" UNIQUE("version_id","id"),
	CONSTRAINT "rows_grid_check" CHECK ("rows"."grid_width" > 0 AND "rows"."grid_height" > 0)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "version_tags" (
	"version_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "version_tags_version_id_tag_id_pk" PRIMARY KEY("version_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"parent_version_id" uuid,
	"title" text NOT NULL,
	"published_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_post_number_unique" UNIQUE("post_id","number"),
	CONSTRAINT "versions_post_id_unique" UNIQUE("post_id","id"),
	CONSTRAINT "versions_parent_check" CHECK ("versions"."parent_version_id" <> "versions"."id")
);
--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_cell_fk" FOREIGN KEY ("version_id","cell_id") REFERENCES "public"."cells"("version_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_version_fk" FOREIGN KEY ("post_id","version_id") REFERENCES "public"."versions"("post_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_element_fk" FOREIGN KEY ("post_id","element_id") REFERENCES "public"."elements"("post_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_row_fk" FOREIGN KEY ("version_id","row_id") REFERENCES "public"."rows"("version_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_slug_redirects" ADD CONSTRAINT "post_slug_redirects_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_published_version_fk" FOREIGN KEY ("id","published_version_id") REFERENCES "public"."versions"("post_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rows" ADD CONSTRAINT "rows_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_tags" ADD CONSTRAINT "version_tags_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_tags" ADD CONSTRAINT "version_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_parent_fk" FOREIGN KEY ("post_id","parent_version_id") REFERENCES "public"."versions"("post_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cell_elements_element_idx" ON "cell_elements" USING btree ("element_id");--> statement-breakpoint
CREATE INDEX "elements_media_idx" ON "elements" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("first_published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "posts"."published_version_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "version_tags_tag_idx" ON "version_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "versions_parent_idx" ON "versions" USING btree ("parent_version_id");