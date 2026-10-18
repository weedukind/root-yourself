import { z } from "zod";
import {
  elementInput,
  type ElementInput,
  type ElementType,
  type ElementView,
  flattenElements,
  type MediaRef,
  pageInput,
  type RootOf,
} from "@/elements/schema";
import { postTitle, type VersionSummary } from "./posts";
import type { TagRef } from "./tags";

// Vertrag für den Inhalt einer Version: GET/PUT /api/admin/posts/:id/versions/:vid.
// Inhalt: ein Baum mit genau einer Page als Wurzel (docs/concept.md, „Seitenlayout“).
// Elementtypen und ihre Schemas: src/elements/schema.ts.

/** Höchstens so viele Elemente pro Seite, die Seite und Verschachteltes mitgezählt – das begrenzt auch die Tiefe. */
export const MAX_PAGE_ELEMENTS = 300;

export { elementInput, pageInput };
export type { ElementInput, ElementType, ElementView, MediaRef };

export type PageView = RootOf<ElementView>;
export type PageInput = RootOf<ElementInput>;

export const saveVersionInput = z
  .object({
    title: postTitle,
    tagIds: z
      .array(z.uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, "Tags doppelt angegeben"),
    root: pageInput,
    // Überschreib-Schutz: Stand der Version, auf dem die Änderung beruht.
    updatedAt: z.iso.datetime(),
  })
  .superRefine((input, ctx) => {
    const all = flattenElements([input.root]);
    if (all.length > MAX_PAGE_ELEMENTS) {
      ctx.addIssue({ code: "custom", path: ["root"], message: `Höchstens ${MAX_PAGE_ELEMENTS} Elemente pro Seite` });
    }
    // Jedes Element höchstens einmal pro Version (wie in der Datenbank).
    const seen = new Set<string>();
    for (const element of all) {
      if (!element.id) continue;
      if (seen.has(element.id)) ctx.addIssue({ code: "custom", path: ["root"], message: "Element doppelt verwendet" });
      seen.add(element.id);
    }
  });

export type SaveVersionInput = z.infer<typeof saveVersionInput>;

export type VersionDetail = VersionSummary & {
  postId: string;
  /** Aktueller Slug des Posts – für den Link auf die öffentliche Seite. */
  postSlug: string;
  /** Die Version, die die Website zeigt (auch wenn es eine andere ist). */
  postPublishedVersion: { id: string; number: number } | null;
  postFirstPublishedAt: string | null;
  tags: TagRef[];
  root: PageView;
};

export type SaveVersionResult = {
  version: VersionDetail;
  /** Gesetzt, wenn die veröffentlichte Version bearbeitet wurde und dafür ein Fork entstand. */
  forkedFrom: string | null;
};
