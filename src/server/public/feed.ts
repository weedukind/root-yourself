import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { cellElements, cells, elements, media, posts, rows, tags, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { excerpt } from "@/lib/excerpt";
import { byName } from "@/lib/sort";
import { FEED_PAGE_SIZE, type FeedPage, type Teaser } from "@/shared/api/feed";
import type { TagRef } from "@/shared/api/tags";
import type { MediaRef } from "@/shared/api/versions";
import type { MediaStorage } from "../media/storage";

// Teaser veröffentlichter Posts, zuerst veröffentlichte zuerst (docs/concept.md, „Öffentliches Frontend“).
// Keyset-Pagination über (first_published_at, id): Erscheint zwischendurch ein neuer Post, gibt es
// weder Duplikate noch Lücken, und späte Seiten bleiben so schnell wie frühe.

type Cursor = { publishedAt: Date; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.publishedAt.toISOString(), cursor.id])).toString("base64url");
}

/** null bei ungültigem Cursor. */
export function decodeCursor(value: string): Cursor | null {
  try {
    const [iso, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown[];
    const publishedAt = new Date(String(iso));
    if (Number.isNaN(publishedAt.getTime()) || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { publishedAt, id };
  } catch {
    return null;
  }
}

export async function listTeasers(
  db: Db,
  storage: MediaStorage,
  options: { after?: Cursor; tagId?: string; limit?: number } = {},
): Promise<FeedPage> {
  const limit = options.limit ?? FEED_PAGE_SIZE;

  const postRows = await db
    .select({ id: posts.id, slug: posts.slug, firstPublishedAt: posts.firstPublishedAt, versionId: posts.publishedVersionId })
    .from(posts)
    .where(
      and(
        isNotNull(posts.publishedVersionId),
        options.after
          ? sql`(${posts.firstPublishedAt}, ${posts.id}) < (${options.after.publishedAt.toISOString()}::timestamptz, ${options.after.id}::uuid)`
          : undefined,
        options.tagId
          ? sql`exists (select 1 from ${versionTags} where ${versionTags.versionId} = ${posts.publishedVersionId} and ${versionTags.tagId} = ${options.tagId})`
          : undefined,
      ),
    )
    .orderBy(desc(posts.firstPublishedAt), desc(posts.id))
    .limit(limit + 1);

  const page = postRows.slice(0, limit);
  const versionIds = page.map((p) => p.versionId!);
  if (versionIds.length === 0) return { teasers: [], nextCursor: null };

  const [titleRows, tagRows, candidates] = await Promise.all([
    db.select({ id: versions.id, title: versions.title }).from(versions).where(inArray(versions.id, versionIds)),
    db
      .select({ versionId: versionTags.versionId, id: tags.id, name: tags.name, slug: tags.slug })
      .from(versionTags)
      .innerJoin(tags, eq(tags.id, versionTags.tagId))
      .where(inArray(versionTags.versionId, versionIds)),
    // Text- und Bild-Elemente in Lesereihenfolge Row → Zelle → Element.
    db
      .select({ versionId: cellElements.versionId, element: elements, medium: media })
      .from(cellElements)
      .innerJoin(cells, eq(cells.id, cellElements.cellId))
      .innerJoin(rows, eq(rows.id, cells.rowId))
      .innerJoin(elements, eq(elements.id, cellElements.elementId))
      .leftJoin(media, eq(media.id, elements.mediaId))
      .where(and(inArray(cellElements.versionId, versionIds), inArray(elements.type, ["text", "image"])))
      .orderBy(asc(rows.position), asc(cells.position), asc(cellElements.position)),
  ]);

  const titles = new Map(titleRows.map((t) => [t.id, t.title]));
  const tagsByVersion = new Map<string, TagRef[]>();
  for (const { versionId, ...tag } of tagRows) tagsByVersion.set(versionId, [...(tagsByVersion.get(versionId) ?? []), tag]);

  const excerpts = new Map<string, string>();
  const images = new Map<string, MediaRef>();
  for (const { versionId, element, medium } of candidates) {
    if (element.type === "text" && !excerpts.has(versionId)) {
      const text = excerpt((element.data as { markdown: string }).markdown);
      if (text) excerpts.set(versionId, text);
    }
    if (element.type === "image" && medium && !images.has(versionId)) {
      images.set(versionId, {
        id: medium.id,
        url: storage.publicUrl(medium.storageKey),
        width: medium.width,
        height: medium.height,
        alt: medium.alt,
      });
    }
  }

  const teasers: Teaser[] = page.map((p) => ({
    slug: p.slug,
    title: titles.get(p.versionId!) ?? "",
    firstPublishedAt: p.firstPublishedAt!.toISOString(),
    tags: (tagsByVersion.get(p.versionId!) ?? []).sort(byName),
    excerpt: excerpts.get(p.versionId!) ?? null,
    image: images.get(p.versionId!) ?? null,
  }));

  const last = page[page.length - 1];
  return {
    teasers,
    nextCursor: postRows.length > limit ? encodeCursor({ publishedAt: last.firstPublishedAt!, id: last.id }) : null,
  };
}

/** Tag für eine Tag-Seite; null, wenn es ihn nicht gibt. */
export async function findTag(db: Db, slug: string): Promise<TagRef | null> {
  const [tag] = await db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(tags).where(eq(tags.slug, slug));
  return tag ?? null;
}
