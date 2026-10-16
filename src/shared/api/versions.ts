import { z } from "zod";
import { elementInput, type ElementInput, type ElementType, type ElementView, type MediaRef } from "@/elements/schema";
import { fitsGrid } from "../grid-placement";
import { postTitle, type VersionSummary } from "./posts";
import type { TagRef } from "./tags";

// Vertrag für den Inhalt einer Version: GET/PUT /api/admin/posts/:id/versions/:vid.
// Layout: Rows → Zellen → Elemente (docs/concept.md, „Seitenlayout“).
// Elementtypen und ihre Schemas: src/elements/schema.ts.

export const MAX_GRID = 12;

const gridSize = z.number().int().min(1).max(MAX_GRID);

export { elementInput };
export type { ElementInput, ElementType, ElementView, MediaRef };
export const cellInput = z.object({
  width: gridSize,
  height: gridSize,
  elements: z.array(elementInput).max(100),
});

export const rowInput = z
  .object({
    gridWidth: gridSize,
    gridHeight: gridSize,
    cells: z.array(cellInput).max(MAX_GRID * MAX_GRID),
  })
  .superRefine((row, ctx) => {
    if (!fitsGrid(row.gridWidth, row.gridHeight, row.cells)) {
      ctx.addIssue({ code: "custom", path: ["cells"], message: `Die Zellen passen nicht in das Grid (${row.gridHeight} Zeilen)` });
    }
    row.cells.forEach((cell, i) => {
      if (cell.width > row.gridWidth) {
        ctx.addIssue({ code: "custom", path: ["cells", i, "width"], message: "Zelle ist breiter als das Grid" });
      }
      if (cell.height > row.gridHeight) {
        ctx.addIssue({ code: "custom", path: ["cells", i, "height"], message: "Zelle ist höher als das Grid" });
      }
    });
  });

export const saveVersionInput = z
  .object({
    title: postTitle,
    tagIds: z
      .array(z.uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, "Tags doppelt angegeben"),
    rows: z.array(rowInput).max(100),
    // Überschreib-Schutz: Stand der Version, auf dem die Änderung beruht.
    updatedAt: z.iso.datetime(),
  })
  .superRefine((input, ctx) => {
    // Jedes Element höchstens einmal pro Version (wie in der Datenbank).
    const seen = new Set<string>();
    for (const row of input.rows) {
      for (const cell of row.cells) {
        for (const element of cell.elements) {
          if (!element.id) continue;
          if (seen.has(element.id)) ctx.addIssue({ code: "custom", path: ["rows"], message: "Element doppelt verwendet" });
          seen.add(element.id);
        }
      }
    }
  });

export type SaveVersionInput = z.infer<typeof saveVersionInput>;

export type CellView = { id: string; width: number; height: number; elements: ElementView[] };
export type RowView = { id: string; gridWidth: number; gridHeight: number; cells: CellView[] };

export type VersionDetail = VersionSummary & {
  postId: string;
  /** Aktueller Slug des Posts – für den Link auf die öffentliche Seite. */
  postSlug: string;
  /** Die Version, die die Website zeigt (auch wenn es eine andere ist). */
  postPublishedVersion: { id: string; number: number } | null;
  postFirstPublishedAt: string | null;
  tags: TagRef[];
  rows: RowView[];
};

export type SaveVersionResult = {
  version: VersionDetail;
  /** Gesetzt, wenn die veröffentlichte Version bearbeitet wurde und dafür ein Fork entstand. */
  forkedFrom: string | null;
};
