import { and, countDistinct, eq, sql } from "drizzle-orm";
import { posts, tags, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { isValidSlug, slugify } from "@/lib/slug";
import type { CreateTagInput, Tag, TagWithUsage, UpdateTagInput } from "@/shared/api/tags";
import { uniqueViolation } from "../db-errors";
import { conflict, invalid, notFound, ok, type Result } from "../result";

type TagRow = typeof tags.$inferSelect;

const germanCollator = new Intl.Collator("de");

const toTag = (row: TagRow): Tag => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// Übersetzt doppelte Namen/Slugs in einen Konflikt; alles andere ist unerwartet und wird geworfen.
function duplicateOrThrow(error: unknown): Result<never> {
  switch (uniqueViolation(error)) {
    case "tags_name_unique":
      return conflict("name_taken", "Ein Tag mit diesem Namen existiert bereits", "name");
    case "tags_slug_unique":
      return conflict("slug_taken", "Ein Tag mit diesem Slug existiert bereits", "slug");
  }
  throw error;
}

export async function listTags(db: Db): Promise<TagWithUsage[]> {
  const rows = await db
    .select({
      tag: tags,
      postCount: countDistinct(versions.postId),
      publishedPostCount: countDistinct(posts.id),
    })
    .from(tags)
    .leftJoin(versionTags, eq(versionTags.tagId, tags.id))
    .leftJoin(versions, eq(versions.id, versionTags.versionId))
    .leftJoin(posts, eq(posts.publishedVersionId, versionTags.versionId))
    .groupBy(tags.id);

  // Deutsch sortieren (Ä bei A): Die Sortierung der Datenbank hängt von deren Collation ab.
  return rows
    .map((r) => ({ ...toTag(r.tag), postCount: r.postCount, publishedPostCount: r.publishedPostCount }))
    .sort((a, b) => germanCollator.compare(a.name, b.name));
}

export async function createTag(db: Db, input: CreateTagInput): Promise<Result<Tag>> {
  const slug = slugify(input.name);
  if (!slug) return invalid("slug_empty", "Aus dem Namen lässt sich kein Slug bilden", "name");

  try {
    // Eigene (Unter-)Transaktion: Eine Regelverletzung macht sonst eine umgebende Transaktion unbrauchbar.
    const [row] = await db.transaction((tx) => tx.insert(tags).values({ name: input.name, slug }).returning());
    return ok(toTag(row));
  } catch (error) {
    return duplicateOrThrow(error);
  }
}

export async function updateTag(db: Db, id: string, input: UpdateTagInput): Promise<Result<Tag>> {
  // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
  // Der Slug bleibt beim Umbenennen erhalten, damit Tag-URLs stabil sind; ändern nur ausdrücklich.
  if (input.slug !== undefined && !isValidSlug(input.slug)) {
    return invalid("slug_invalid", "Nur Kleinbuchstaben, Ziffern und einzelne Bindestriche", "slug");
  }

  try {
    const [row] = await db.transaction((tx) =>
      tx
        .update(tags)
        .set({ name: input.name, slug: input.slug, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(tags.id, id), eq(tags.updatedAt, new Date(input.updatedAt))))
        .returning(),
    );
    if (row) return ok(toTag(row));
  } catch (error) {
    return duplicateOrThrow(error);
  }

  // Kein Treffer: Entweder gibt es den Tag nicht, oder er wurde inzwischen geändert.
  const [exists] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id));
  return exists
    ? conflict("stale", "Der Tag wurde inzwischen geändert. Bitte neu laden.")
    : notFound("Tag");
}

export async function deleteTag(db: Db, id: string): Promise<Result<null>> {
  // Entfernt den Tag aus allen Versionen, auch eingefrorenen (ON DELETE CASCADE).
  const [row] = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  return row ? ok(null) : notFound("Tag");
}
