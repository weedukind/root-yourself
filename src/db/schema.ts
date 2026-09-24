import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Siehe docs/concept.md für Regeln und Hintergründe.

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const postStatus = pgEnum("post_status", ["draft", "published"]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  r2Key: text("r2_key").notNull().unique(),
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
    title: text("title").notNull(),
    status: postStatus("status").notNull().default("draft"),
    ...timestamps,
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    check("posts_published_at_check", sql`${t.status} = 'draft' OR ${t.publishedAt} IS NOT NULL`),
    index("posts_feed_idx")
      .on(t.publishedAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'published'`),
  ],
);

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index("post_tags_tag_idx").on(t.tagId)],
);

export const postElements = pgTable(
  "post_elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "restrict" }),
  },
  (t) => [
    unique("post_elements_post_position_unique").on(t.postId, t.position),
    check("post_elements_media_check", sql`(${t.type} = 'image') = (${t.mediaId} IS NOT NULL)`),
    index("post_elements_media_idx").on(t.mediaId),
    index("post_elements_type_idx").on(t.postId, t.type, t.position),
  ],
);

export const postSlugRedirects = pgTable("post_slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
