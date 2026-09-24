import { z } from "zod";

// Vertrag der Tag-Endpunkte unter /api/admin/tags.

export const tagName = z.string().trim().min(1, "Name darf nicht leer sein").max(60, "Höchstens 60 Zeichen");

export const createTagInput = z.object({ name: tagName });

export const updateTagInput = z.object({
  name: tagName.optional(),
  slug: z.string().trim().optional(),
  // Überschreib-Schutz: Stand, auf dem die Änderung beruht.
  updatedAt: z.iso.datetime(),
});

export type CreateTagInput = z.infer<typeof createTagInput>;
export type UpdateTagInput = z.infer<typeof updateTagInput>;

export type Tag = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type TagWithUsage = Tag & {
  // Posts, in denen irgendeine Version den Tag nutzt / deren veröffentlichte Version ihn nutzt.
  postCount: number;
  publishedPostCount: number;
};
