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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Siehe docs/concept.md für das Datenmodell, die Versionsregeln und das Seitenlayout.
// FKs ohne onDelete sind NO ACTION. Postgres prüft sie am Ende jeder einzelnen Kaskade;
// version_elements_element_fk ist deshalb aufgeschoben (drizzle/0008_…), sonst scheitert das
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

// Ordner der Mediathek, beliebig tief verschachtelt; parent_id null heißt oberste Ebene.
// Namen sind je Elternordner eindeutig (NULLS NOT DISTINCT: auch auf der obersten Ebene).
// RESTRICT: Nur leere Ordner lassen sich löschen. Zyklen beim Verschieben verhindert der Service.
export const mediaFolders = pgTable(
  "media_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => mediaFolders.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("media_folders_parent_name_unique").on(t.parentId, t.name).nullsNotDistinct(),
    check("media_folders_name_check", sql`length(trim(${t.name})) > 0`),
    check("media_folders_not_own_parent_check", sql`${t.parentId} IS DISTINCT FROM ${t.id}`),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Jedes Bild liegt in genau einem Ordner.
    folderId: uuid("folder_id")
      .notNull()
      .references(() => mediaFolders.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("media_folder_idx").on(t.folderId)],
);

// Tags gelten für Posts (pro Version, siehe version_tags) und für Medien. Medien sind nicht
// versioniert, daher eine einfache Zuordnung.
export const mediaTags = pgTable(
  "media_tags",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.tagId] }), index("media_tags_tag_idx").on(t.tagId)],
);

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

// Inhalt einer Version als Baum: Wurzel ist genau ein Page-Element (parent_element_id null),
// darunter Container (Liste, Slide …) und ihre Kinder. Die Elemente selbst sind zwischen Versionen
// geteilt (Copy-on-Write); diese Tabelle hält pro Version, wo sie stehen.
export const versionElements = pgTable(
  "version_elements",
  {
    versionId: uuid("version_id").notNull(),
    postId: uuid("post_id").notNull(),
    elementId: uuid("element_id").notNull(),
    // Container, in dem das Element steht; null: die Wurzel (Page).
    parentElementId: uuid("parent_element_id"),
    // Position innerhalb des Elternteils.
    position: integer("position").notNull(),
  },
  (t) => [
    // Jedes Element höchstens einmal pro Version.
    primaryKey({ name: "version_elements_pkey", columns: [t.versionId, t.elementId] }),
    unique("version_elements_position_unique").on(t.versionId, t.parentElementId, t.position).nullsNotDistinct(),
    // Genau eine Wurzel pro Version (dass es eine gibt, sichern Anlegen und Speichern).
    uniqueIndex("version_elements_root_unique").on(t.versionId).where(sql`${t.parentElementId} IS NULL`),
    // Das Elternteil steht in derselben Version; fällt es weg, fallen seine Kinder mit.
    foreignKey({
      name: "version_elements_parent_fk",
      columns: [t.versionId, t.parentElementId],
      foreignColumns: [t.versionId, t.elementId],
    }).onDelete("cascade"),
    foreignKey({
      name: "version_elements_version_fk",
      columns: [t.postId, t.versionId],
      foreignColumns: [versions.postId, versions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "version_elements_element_fk",
      columns: [t.postId, t.elementId],
      foreignColumns: [elements.postId, elements.id],
    }),
    index("version_elements_element_idx").on(t.elementId),
  ],
);

export const postSlugRedirects = pgTable("post_slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", TIMESTAMP).notNull().defaultNow(),
});

// Admin-Zugänge. Es gibt keine Registrierung: Nutzer werden von Hand eingetragen
// (Passwort-Hash mit `npm run user:hash`, siehe docs/concept.md). E-Mails stehen kleingeschrieben
// in der Tabelle, damit die Anmeldung nicht an der Schreibweise scheitert.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (t) => [check("users_email_lowercase_check", sql`${t.email} = lower(${t.email})`)],
);

// Anmeldungen. Das Cookie enthält einen Zufallstoken; gespeichert ist nur dessen SHA-256,
// damit ein Datenbank-Auszug keine gültigen Sessions verrät.
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", TIMESTAMP).notNull(),
    createdAt: timestamp("created_at", TIMESTAMP).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// API-Zugang für Skripte und andere Programme (Authorization: Bearer …, nur /api/admin/…).
// Höchstens ein Token pro Nutzer: ein neuer ersetzt den alten. Gespeichert ist nur der SHA-256,
// den Token selbst sieht man ein einziges Mal beim Erzeugen.
export const apiTokens = pgTable("api_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", TIMESTAMP).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", TIMESTAMP).notNull(),
  // null: noch nie benutzt.
  lastUsedAt: timestamp("last_used_at", TIMESTAMP),
});
