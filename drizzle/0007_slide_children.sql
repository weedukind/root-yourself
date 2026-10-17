ALTER TABLE "cell_elements" DROP CONSTRAINT "cell_elements_version_element_unique";--> statement-breakpoint
ALTER TABLE "cell_elements" DROP CONSTRAINT "cell_elements_cell_id_position_pk";--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_pkey" PRIMARY KEY("version_id","element_id");--> statement-breakpoint
ALTER TABLE "cell_elements" ADD COLUMN "parent_element_id" uuid;--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_parent_fk" FOREIGN KEY ("version_id","parent_element_id") REFERENCES "public"."cell_elements"("version_id","element_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_elements" ADD CONSTRAINT "cell_elements_position_unique" UNIQUE NULLS NOT DISTINCT("cell_id","parent_element_id","position");