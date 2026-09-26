import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { versions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { VersionDetail } from "@/shared/api/versions";
import type { MediaStorage } from "../media/storage";
import { createPreviewToken, previewPath, verifyPreviewToken } from "../preview-token";
import { getPost } from "../posts/posts";
import { notFound, ok, type Result } from "../result";
import { getVersion } from "../versions/content";

// Vorschau über signierte Links: /preview/<slug>/<version-id>/<token> (docs/concept.md, „Vorschau“).

export type PreviewLookup =
  | { kind: "preview"; version: VersionDetail; expiresAt: Date }
  | { kind: "redirect"; path: string }
  | { kind: "missing" };

const uuid = z.uuid();

export async function findPreview(
  db: Db,
  storage: MediaStorage,
  slug: string,
  versionId: string,
  token: string,
  now = new Date(),
): Promise<PreviewLookup> {
  if (!uuid.safeParse(versionId).success) return { kind: "missing" };
  // Erst die Signatur, dann die Datenbank: ungültige Links kosten keine Abfrage.
  const expiresAt = verifyPreviewToken(versionId, token, now);
  if (!expiresAt) return { kind: "missing" };

  const [row] = await db.select({ postId: versions.postId }).from(versions).where(eq(versions.id, versionId));
  if (!row) return { kind: "missing" };
  const version = await getVersion(db, storage, row.postId, versionId);
  if (!version.ok) return { kind: "missing" };

  // Slug geändert: Der Link bleibt gültig und führt zur aktuellen Adresse.
  if (version.value.postSlug !== slug) {
    return { kind: "redirect", path: previewPath(version.value.postSlug, versionId, token) };
  }
  return { kind: "preview", version: version.value, expiresAt };
}

export const SHARE_DAYS = [1, 7, 30] as const;

/** Erzeugt einen teilbaren Vorschau-Link für eine Version. */
export async function createShareLink(
  db: Db,
  postId: string,
  versionId: string,
  days: number,
  now = new Date(),
): Promise<Result<{ path: string; expiresAt: string }>> {
  const [version] = await db
    .select({ id: versions.id })
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.postId, postId)));
  if (!version) return notFound("Version");
  const post = await getPost(db, postId);
  if (!post.ok) return post;
  const { token, expiresAt } = createPreviewToken(versionId, days, now);
  return ok({ path: previewPath(post.value.slug, versionId, token), expiresAt: expiresAt.toISOString() });
}
