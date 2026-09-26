import { z } from "zod";

// Vertrag der Post-Endpunkte unter /api/admin/posts. Versionen: siehe docs/concept.md.

export const postTitle = z.string().trim().min(1, "Titel darf nicht leer sein").max(200, "Höchstens 200 Zeichen");

export const createPostInput = z.object({
  title: postTitle,
  // Ohne Angabe wird der Slug aus dem Titel erzeugt.
  slug: z.string().trim().optional(),
});

export const updatePostInput = z.object({
  slug: z.string().trim(),
  // Überschreib-Schutz: Stand, auf dem die Änderung beruht.
  updatedAt: z.iso.datetime(),
});

export type CreatePostInput = z.infer<typeof createPostInput>;
export type UpdatePostInput = z.infer<typeof updatePostInput>;

export type VersionSummary = {
  id: string;
  number: number;
  parentVersionId: string | null;
  title: string;
  /** Blatt = keine Kinder. Bearbeitbar sind nur unveröffentlichte Blätter. */
  isLeaf: boolean;
  isPublished: boolean;
  isEditable: boolean;
  /** Letzte Veröffentlichung dieser Version (auch wenn sie nicht mehr veröffentlicht ist). */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PostSummary = {
  id: string;
  slug: string;
  /** Titel der veröffentlichten Version, sonst der zuletzt geänderten. */
  title: string;
  firstPublishedAt: string | null;
  publishedVersion: { id: string; number: number; publishedAt: string | null } | null;
  versionCount: number;
  editableVersionCount: number;
  createdAt: string;
  /** Post selbst (Slug) – für den Überschreib-Schutz beim Slug-Ändern. */
  updatedAt: string;
  /** Letzte Änderung am Post oder an einer seiner Versionen. */
  lastChangedAt: string;
};

export type PostDetail = PostSummary & {
  versions: VersionSummary[];
  /** Frühere Slugs, die auf diesen Post weiterleiten. */
  redirectSlugs: string[];
};
