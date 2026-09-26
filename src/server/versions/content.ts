import { and, asc, countDistinct, eq, inArray, max, sql } from "drizzle-orm";
import { cellElements, cells, elements, media, rows, tags, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { byName } from "@/lib/sort";
import type {
  CellView,
  ElementInput,
  ElementView,
  RowView,
  SaveVersionInput,
  SaveVersionResult,
  VersionDetail,
} from "@/shared/api/versions";
import { foreignKeyConstraint } from "../db-errors";
import type { MediaStorage } from "../media/storage";
import { getPost } from "../posts/posts";
import { conflict, invalid, notFound, ok, type Result } from "../result";
import { deleteOrphanElements, hasChildren, lockVersion } from "./versions";

// Inhalt einer Version laden und speichern (docs/concept.md, „Speichern eines Blatts im Detail“).

type ElementRow = typeof elements.$inferSelect;
type MediaRow = typeof media.$inferSelect;

function toElementView(row: ElementRow, medium: MediaRow | null, storage: MediaStorage): ElementView {
  switch (row.type) {
    case "heading":
      return { id: row.id, type: "heading", data: row.data as Extract<ElementView, { type: "heading" }>["data"] };
    case "text":
      return { id: row.id, type: "text", data: row.data as Extract<ElementView, { type: "text" }>["data"] };
    case "image":
      return {
        id: row.id,
        type: "image",
        data: row.data as Extract<ElementView, { type: "image" }>["data"],
        mediaId: row.mediaId!,
        media: {
          id: medium!.id,
          url: storage.publicUrl(medium!.storageKey),
          width: medium!.width,
          height: medium!.height,
          alt: medium!.alt,
        },
      };
    default:
      throw new Error(`Unbekannter Elementtyp ${row.type}`);
  }
}

export async function getVersion(
  db: Db,
  storage: MediaStorage,
  postId: string,
  versionId: string,
): Promise<Result<VersionDetail>> {
  const post = await getPost(db, postId);
  if (!post.ok) return post;
  const summary = post.value.versions.find((v) => v.id === versionId);
  if (!summary) return notFound("Version");

  const [tagRows, rowRows, cellRows, links] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(versionTags)
      .innerJoin(tags, eq(tags.id, versionTags.tagId))
      .where(eq(versionTags.versionId, versionId)),
    db.select().from(rows).where(eq(rows.versionId, versionId)).orderBy(asc(rows.position)),
    db.select().from(cells).where(eq(cells.versionId, versionId)).orderBy(asc(cells.position)),
    db
      .select({ link: cellElements, element: elements, medium: media })
      .from(cellElements)
      .innerJoin(elements, eq(elements.id, cellElements.elementId))
      .leftJoin(media, eq(media.id, elements.mediaId))
      .where(eq(cellElements.versionId, versionId))
      .orderBy(asc(cellElements.position)),
  ]);

  const cellView = (cellId: string): CellView["elements"] =>
    links.filter((l) => l.link.cellId === cellId).map((l) => toElementView(l.element, l.medium, storage));

  const rowViews: RowView[] = rowRows.map((row) => ({
    id: row.id,
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
    cells: cellRows
      .filter((c) => c.rowId === row.id)
      .map((c) => ({ id: c.id, width: c.width, height: c.height, elements: cellView(c.id) })),
  }));

  return ok({ ...summary, postId, tags: tagRows.sort(byName), rows: rowViews });
}

/** JSON mit sortierten Schlüsseln: jsonb liefert Objekte nicht in der gespeicherten Reihenfolge. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const elementValues = (element: ElementInput) => ({
  type: element.type,
  data: element.data,
  mediaId: element.type === "image" ? element.mediaId : null,
});

function unchanged(row: ElementRow, values: ReturnType<typeof elementValues>): boolean {
  return row.type === values.type && row.mediaId === values.mediaId && stableJson(row.data) === stableJson(values.data);
}

/**
 * Speichert den vollständigen Stand einer Version.
 * - Nur unveröffentlichte Blätter werden direkt geändert.
 * - Ist die Version veröffentlicht, entsteht automatisch ein Fork mit den Änderungen.
 * - Versionen mit Forks sind eingefroren.
 * - Geänderte Elemente werden direkt geändert, wenn nur diese Version sie nutzt, sonst geklont.
 */
export async function saveVersion(
  db: Db,
  storage: MediaStorage,
  postId: string,
  versionId: string,
  input: SaveVersionInput,
): Promise<Result<SaveVersionResult>> {
  let outcome: Result<{ targetId: string; forkedFrom: string | null }>;
  try {
    outcome = await db.transaction(async (tx) => {
      const locked = await lockVersion(tx, postId, versionId);
      if (!locked) return notFound("Version");
      const { post, version } = locked;

      if (version.updatedAt.getTime() !== new Date(input.updatedAt).getTime()) {
        return conflict("version_conflict", "Die Version wurde inzwischen geändert. Bitte neu laden.");
      }
      if (await hasChildren(tx, versionId)) {
        return conflict("version_frozen", "Diese Version hat Forks und ist eingefroren. Zum Weiterarbeiten forken.");
      }

      // Bestehende Elemente dürfen nur aus dieser Version stammen. Vor dem Fork prüfen, damit
      // bei einem Fehler kein leerer Fork übrig bleibt.
      const inputElements = input.rows.flatMap((row) => row.cells.flatMap((cell) => cell.elements));
      const sourceLinks = await tx
        .select({ elementId: cellElements.elementId })
        .from(cellElements)
        .where(eq(cellElements.versionId, versionId));
      const sourceIds = new Set(sourceLinks.map((l) => l.elementId));
      if (inputElements.some((e) => e.id && !sourceIds.has(e.id))) {
        return invalid("element_unknown", "Ein Element gehört nicht zu dieser Version", "rows");
      }

      // Veröffentlichte Version: Sie bleibt unverändert, die Änderungen gehen in einen Fork.
      let targetId = versionId;
      let forkedFrom: string | null = null;
      if (post.publishedVersionId === versionId) {
        const [{ highest }] = await tx
          .select({ highest: max(versions.number) })
          .from(versions)
          .where(eq(versions.postId, postId));
        const [fork] = await tx
          .insert(versions)
          .values({ postId, number: (highest ?? 0) + 1, parentVersionId: versionId, title: input.title })
          .returning({ id: versions.id });
        targetId = fork.id;
        forkedFrom = versionId;
      }

      // Copy-on-Write für Elemente.
      const ids = [...sourceIds];
      const existing = new Map(
        ids.length ? (await tx.select().from(elements).where(inArray(elements.id, ids))).map((e) => [e.id, e]) : [],
      );
      const usage = new Map(
        ids.length
          ? (
              await tx
                .select({ elementId: cellElements.elementId, versions: countDistinct(cellElements.versionId) })
                .from(cellElements)
                .where(inArray(cellElements.elementId, ids))
                .groupBy(cellElements.elementId)
            ).map((u) => [u.elementId, u.versions])
          : [],
      );

      const resolvedIds: string[] = [];
      for (const element of inputElements) {
        const values = elementValues(element);
        const row = element.id ? existing.get(element.id) : undefined;
        if (row && unchanged(row, values)) {
          resolvedIds.push(row.id);
        } else if (row && targetId === versionId && usage.get(row.id) === 1) {
          // Nur diese Version nutzt das Element: direkt ändern.
          // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
          await tx.update(elements).set({ ...values, updatedAt: sql`clock_timestamp()` }).where(eq(elements.id, row.id));
          resolvedIds.push(row.id);
        } else {
          // Neu, oder geändert und mit anderen Versionen geteilt: neues Element.
          const [created] = await tx.insert(elements).values({ postId, ...values }).returning({ id: elements.id });
          resolvedIds.push(created.id);
        }
      }

      // Layout und Tags der Zielversion neu schreiben (Strukturdaten ohne Inhalt).
      await tx.delete(rows).where(eq(rows.versionId, targetId));
      await tx.delete(versionTags).where(eq(versionTags.versionId, targetId));
      await writeLayout(tx, postId, targetId, input, resolvedIds);
      if (input.tagIds.length > 0) {
        await tx.insert(versionTags).values(input.tagIds.map((tagId) => ({ versionId: targetId, tagId })));
      }

      await tx
        .update(versions)
        .set({ title: input.title, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(versions.id, targetId), eq(versions.postId, postId)));
      await deleteOrphanElements(tx, postId);
      return ok({ targetId, forkedFrom });
    });
  } catch (error) {
    switch (foreignKeyConstraint(error)) {
      case "version_tags_tag_id_tags_id_fk":
        return invalid("tag_unknown", "Ein angegebener Tag existiert nicht", "tagIds");
      case "elements_media_id_media_id_fk":
        return invalid("media_unknown", "Ein angegebenes Bild existiert nicht", "rows");
    }
    throw error;
  }

  if (!outcome.ok) return outcome;
  const saved = await getVersion(db, storage, postId, outcome.value.targetId);
  if (!saved.ok) return saved;
  return ok({ version: saved.value, forkedFrom: outcome.value.forkedFrom });
}

/** Schreibt Rows, Zellen und Element-Verknüpfungen; die Reihenfolge der Arrays ergibt die Positionen. */
async function writeLayout(
  tx: Db,
  postId: string,
  versionId: string,
  input: SaveVersionInput,
  elementIds: string[],
): Promise<void> {
  if (input.rows.length === 0) return;
  const newRows = await tx
    .insert(rows)
    .values(input.rows.map((row, position) => ({ versionId, position, gridWidth: row.gridWidth, gridHeight: row.gridHeight })))
    .returning({ id: rows.id, position: rows.position });
  const rowIds = new Map(newRows.map((r) => [r.position, r.id]));

  const cellValues = input.rows.flatMap((row, rowPosition) =>
    row.cells.map((cell, position) => ({
      versionId,
      rowId: rowIds.get(rowPosition)!,
      position,
      width: cell.width,
      height: cell.height,
    })),
  );
  if (cellValues.length === 0) return;
  const newCells = await tx.insert(cells).values(cellValues).returning({ id: cells.id, rowId: cells.rowId, position: cells.position });
  const cellIds = new Map(newCells.map((c) => [`${c.rowId}:${c.position}`, c.id]));

  let next = 0;
  const links = input.rows.flatMap((row, rowPosition) =>
    row.cells.flatMap((cell, cellPosition) =>
      cell.elements.map((_, position) => ({
        cellId: cellIds.get(`${rowIds.get(rowPosition)}:${cellPosition}`)!,
        versionId,
        postId,
        position,
        elementId: elementIds[next++],
      })),
    ),
  );
  if (links.length > 0) await tx.insert(cellElements).values(links);
}
