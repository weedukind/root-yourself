import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Siehe docs/concept.md für das Datenmodell, die Versionsregeln und das Seitenlayout.
// FKs ohne onDelete sind NO ACTION. Postgres prüft sie am Ende jeder einzelnen Kaskade;
// cell_elements_element_fk ist deshalb aufgeschoben (drizzle/0001_…), sonst scheitert das
// Löschen eines Posts mit Elementen.

// Millisekunden statt Mikrosekunden: JavaScript-Dates kennen nur Millisekunden. Sonst würde ein
// zurückgeschicktes updatedAt (Überschreib-Schutz) nie exakt dem gespeicherten Wert entsprechen.
const TIMESTAMP = { withTimezone: true, precision: 3 } as const;

const timestamps = {
  createdAt: timestamp("created_at", TIMESTAMP).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", TIMESTAMP).notNull().defaultNow(),
};

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  storageKey: text("storage_key").notNull().unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt").notNull().default(""),
  ...timestamps,
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    publishedVersionId: uuid("published_version_id"),
    firstPublishedAt: timestamp("first_published_at", TIMESTAMP),
    ...timestamps,
  },
  (t) => [
    check(
      "posts_first_published_at_check",
      sql`${t.publishedVersionId} IS NULL OR ${t.firstPublishedAt} IS NOT NULL`,
    ),
    // Die veröffentlichte Version muss zu diesem Post gehören.
    foreignKey({
      name: "posts_published_version_fk",
      columns: [t.id, t.publishedVersionId],
      foreignColumns: [versions.postId, versions.id],
    }),
    index("posts_feed_idx")
      .on(t.firstPublishedAt.desc(), t.id.desc())
      .where(sql`${t.publishedVersionId} IS NOT NULL`),
  ],
);

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    parentVersionId: uuid("parent_version_id"),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", TIMESTAMP),
    ...timestamps,
  },
  (t) => [
    unique("versions_post_number_unique").on(t.postId, t.number),
    unique("versions_post_id_unique").on(t.postId, t.id),
    check("versions_parent_check", sql`${t.parentVersionId} <> ${t.id}`),
    // Die Elternversion muss zum selben Post gehören.
    foreignKey({
      name: "versions_parent_fk",
      columns: [t.postId, t.parentVersionId],
      foreignColumns: [t.postId, t.id],
    }),
    index("versions_parent_idx").on(t.parentVersionId),
  ],
);

export const versionTags = pgTable(
  "version_tags",
  {
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.tagId] }),
    index("version_tags_tag_idx").on(t.tagId),
  ],
);

export const elements = pgTable(
  "elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Kein fachlicher Besitz – nur Integrität: Versionen verlinken nur Elemente ihres Posts.
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    unique("elements_post_id_unique").on(t.postId, t.id),
    check("elements_media_check", sql`(${t.type} = 'image') = (${t.mediaId} IS NOT NULL)`),
    index("elements_media_idx").on(t.mediaId),
  ],
);

export const rows = pgTable(
  "rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    gridWidth: integer("grid_width").notNull(),
    gridHeight: integer("grid_height").notNull(),
  },
  (t) => [
    unique("rows_version_position_unique").on(t.versionId, t.position),
    unique("rows_version_id_unique").on(t.versionId, t.id),
    check("rows_grid_check", sql`${t.gridWidth} > 0 AND ${t.gridHeight} > 0`),
  ],
);

export const cells = pgTable(
  "cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id").notNull(),
    rowId: uuid("row_id").notNull(),
    position: integer("position").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
  },
  (t) => [
    unique("cells_row_position_unique").on(t.rowId, t.position),
    unique("cells_version_id_unique").on(t.versionId, t.id),
    check("cells_size_check", sql`${t.width} > 0 AND ${t.height} > 0`),
    // Die Zelle gehört zu einer Row derselben Version.
    foreignKey({
      name: "cells_row_fk",
      columns: [t.versionId, t.rowId],
      foreignColumns: [rows.versionId, rows.id],
    }).onDelete("cascade"),
  ],
);

export const cellElements = pgTable(
  "cell_elements",
  {
    cellId: uuid("cell_id").notNull(),
    versionId: uuid("version_id").notNull(),
    postId: uuid("post_id").notNull(),
    position: integer("position").notNull(),
    elementId: uuid("element_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cellId, t.position] }),
    // Jedes Element höchstens einmal pro Version.
    unique("cell_elements_version_element_unique").on(t.versionId, t.elementId),
    foreignKey({
      name: "cell_elements_cell_fk",
      columns: [t.versionId, t.cellId],
      foreignColumns: [cells.versionId, cells.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cell_elements_version_fk",
      columns: [t.postId, t.versionId],
      foreignColumns: [versions.postId, versions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cell_elements_element_fk",
      columns: [t.postId, t.elementId],
      foreignColumns: [elements.postId, elements.id],
    }),
    index("cell_elements_element_idx").on(t.elementId),
  ],
);

export const postSlugRedirects = pgTable("post_slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", TIMESTAMP).notNull().defaultNow(),
});
