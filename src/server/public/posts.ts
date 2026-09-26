import { and, eq, isNotNull } from "drizzle-orm";
import { posts, postSlugRedirects } from "@/db/schema";
import type { Db } from "@/db/types";
import type { TagRef } from "@/shared/api/tags";
import type { RowView } from "@/shared/api/versions";
import type { MediaStorage } from "../media/storage";
import { getVersion } from "../versions/content";

// Lesezugriffe für die öffentliche Website: nur veröffentlichte Versionen.

export type PublicPost = {
  slug: string;
  title: string;
  /** Erste Veröffentlichung des Posts („Veröffentlicht am“). */
  firstPublishedAt: string;
  /** Veröffentlichung der aktuell öffentlichen Version („Aktualisiert am“, wenn später). */
  publishedAt: string | null;
  tags: TagRef[];
  rows: RowView[];
};

export type PostLookup =
  | { kind: "post"; post: PublicPost }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

/** Sucht einen veröffentlichten Post über seinen Slug; alte Slugs führen zu einer Weiterleitung. */
export async function findPublishedPost(db: Db, storage: MediaStorage, slug: string): Promise<PostLookup> {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), isNotNull(posts.publishedVersionId)));

  if (post) {
    const version = await getVersion(db, storage, post.id, post.publishedVersionId!);
    if (!version.ok) return { kind: "missing" };
    return {
      kind: "post",
      post: {
        slug: post.slug,
        title: version.value.title,
        firstPublishedAt: post.firstPublishedAt!.toISOString(),
        publishedAt: version.value.publishedAt,
        tags: version.value.tags,
        rows: version.value.rows,
      },
    };
  }

  // Früherer Slug eines (noch) veröffentlichten Posts → auf den aktuellen weiterleiten.
  const [redirect] = await db
    .select({ slug: posts.slug })
    .from(postSlugRedirects)
    .innerJoin(posts, eq(posts.id, postSlugRedirects.postId))
    .where(and(eq(postSlugRedirects.oldSlug, slug), isNotNull(posts.publishedVersionId)));
  return redirect ? { kind: "redirect", slug: redirect.slug } : { kind: "missing" };
}
