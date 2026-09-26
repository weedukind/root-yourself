import { desc, eq, inArray, sql } from "drizzle-orm";
import { posts, postSlugRedirects, versions } from "@/db/schema";
import type { Db } from "@/db/types";
import { isValidSlug, slugify } from "@/lib/slug";
import { compareGerman } from "@/lib/sort";
import type {
  CreatePostInput,
  PostDetail,
  PostSummary,
  UpdatePostInput,
  VersionSummary,
} from "@/shared/api/posts";
import { uniqueViolation } from "../db-errors";
import { conflict, invalid, notFound, ok, type Result } from "../result";

type PostRow = typeof posts.$inferSelect;
type VersionRow = typeof versions.$inferSelect;

const iso = (date: Date | null) => date?.toISOString() ?? null;

const slugTaken = () => conflict("slug_taken", "Ein anderer Post hat bereits diesen Slug", "slug");
const slugInvalid = () =>
  invalid("slug_invalid", "Nur Kleinbuchstaben, Ziffern und einzelne Bindestriche", "slug");

function toVersion(row: VersionRow, post: PostRow, parentIds: Set<string>): VersionSummary {
  const isLeaf = !parentIds.has(row.id);
  const isPublished = post.publishedVersionId === row.id;
  return {
    id: row.id,
    number: row.number,
    parentVersionId: row.parentVersionId,
    title: row.title,
    isLeaf,
    isPublished,
    isEditable: isLeaf && !isPublished,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function summarize(post: PostRow, versionRows: VersionRow[]): { summary: PostSummary; versions: VersionSummary[] } {
  const parentIds = new Set(versionRows.flatMap((v) => (v.parentVersionId ? [v.parentVersionId] : [])));
  const list = versionRows.map((v) => toVersion(v, post, parentIds)).sort((a, b) => a.number - b.number);
  const published = list.find((v) => v.isPublished) ?? null;
  const lastChanged = versionRows.reduce((latest, v) => (v.updatedAt > latest ? v.updatedAt : latest), post.updatedAt);
  const latestVersion = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const summary: PostSummary = {
    id: post.id,
    slug: post.slug,
    title: (published ?? latestVersion)?.title ?? "",
    firstPublishedAt: iso(post.firstPublishedAt),
    publishedVersion: published && { id: published.id, number: published.number, publishedAt: published.publishedAt },
    versionCount: list.length,
    editableVersionCount: list.filter((v) => v.isEditable).length,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    lastChangedAt: lastChanged.toISOString(),
  };
  return { summary, versions: list };
}

async function versionsOf(db: Db, postIds: string[]): Promise<Map<string, VersionRow[]>> {
  const byPost = new Map<string, VersionRow[]>();
  if (postIds.length === 0) return byPost;
  for (const row of await db.select().from(versions).where(inArray(versions.postId, postIds))) {
    byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row]);
  }
  return byPost;
}

/** Alle Posts, zuletzt geänderte zuerst. */
export async function listPosts(db: Db): Promise<PostSummary[]> {
  const postRows = await db.select().from(posts).orderBy(desc(posts.createdAt));
  const byPost = await versionsOf(db, postRows.map((p) => p.id));
  return postRows
    .map((post) => summarize(post, byPost.get(post.id) ?? []).summary)
    .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt) || compareGerman(a.title, b.title));
}

export async function getPost(db: Db, id: string): Promise<Result<PostDetail>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) return notFound("Post");
  const versionRows = (await versionsOf(db, [id])).get(id) ?? [];
  const redirects = await db
    .select({ slug: postSlugRedirects.oldSlug })
    .from(postSlugRedirects)
    .where(eq(postSlugRedirects.postId, id))
    .orderBy(desc(postSlugRedirects.createdAt));
  const { summary, versions: versionList } = summarize(post, versionRows);
  return ok({ ...summary, versions: versionList, redirectSlugs: redirects.map((r) => r.slug) });
}

/** Legt einen Post mit Version 1 an (ohne Layout, ohne Tags). */
export async function createPost(db: Db, input: CreatePostInput): Promise<Result<PostDetail>> {
  const slug = input.slug ?? slugify(input.title);
  if (!slug) return invalid("slug_empty", "Aus dem Titel lässt sich kein Slug bilden", "title");
  if (!isValidSlug(slug)) return slugInvalid();

  let postId: string;
  try {
    postId = await db.transaction(async (tx) => {
      // War der Slug früher der eines anderen Posts, übernimmt ihn der neue Post; die alte
      // Weiterleitung entfällt.
      await tx.delete(postSlugRedirects).where(eq(postSlugRedirects.oldSlug, slug));
      const [post] = await tx.insert(posts).values({ slug }).returning({ id: posts.id });
      await tx.insert(versions).values({ postId: post.id, number: 1, title: input.title });
      return post.id;
    });
  } catch (error) {
    if (uniqueViolation(error) === "posts_slug_unique") return slugTaken();
    throw error;
  }
  return getPost(db, postId);
}

/**
 * Ändert den Slug (gilt für alle Versionen). War der Post schon einmal veröffentlicht, leitet
 * der alte Slug weiter – auf den Post, nicht auf den nächsten Slug, daher keine Ketten.
 */
export async function changeSlug(db: Db, id: string, input: UpdatePostInput): Promise<Result<PostDetail>> {
  if (!isValidSlug(input.slug)) return slugInvalid();

  let outcome: Result<null>;
  try {
    outcome = await db.transaction(async (tx) => {
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for("update");
      if (!post) return notFound("Post");
      if (post.updatedAt.getTime() !== new Date(input.updatedAt).getTime()) {
        return conflict("stale", "Der Post wurde inzwischen geändert. Bitte neu laden.");
      }
      if (post.slug === input.slug) return ok(null);

      // Der neue Slug ist ab jetzt der aktuelle – als Weiterleitung (eigene oder eines anderen
      // Posts) entfällt er.
      await tx.delete(postSlugRedirects).where(eq(postSlugRedirects.oldSlug, input.slug));
      if (post.firstPublishedAt) {
        await tx.insert(postSlugRedirects).values({ oldSlug: post.slug, postId: id });
      }
      // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
      await tx.update(posts).set({ slug: input.slug, updatedAt: sql`clock_timestamp()` }).where(eq(posts.id, id));
      return ok(null);
    });
  } catch (error) {
    if (uniqueViolation(error) === "posts_slug_unique") return slugTaken();
    throw error;
  }
  return outcome.ok ? getPost(db, id) : outcome;
}

/** Löscht den Post mit allen Versionen, Elementen und Weiterleitungen – auch wenn er veröffentlicht ist. */
export async function deletePost(db: Db, id: string): Promise<Result<null>> {
  const [row] = await db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
  return row ? ok(null) : notFound("Post");
}
