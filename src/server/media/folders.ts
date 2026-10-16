import { and, count, eq, sql } from "drizzle-orm";
import { media, mediaFolders } from "@/db/schema";
import type { Db } from "@/db/types";
import { byName } from "@/lib/sort";
import type { CreateFolderInput, MediaFolder, UpdateFolderInput } from "@/shared/api/media";
import { foreignKeyViolation, restrictViolation, uniqueViolation } from "../db-errors";
import { conflict, invalid, notFound, ok, type Result } from "../result";

// Ordner der Mediathek (docs/concept.md, „Mediathek“). Die Datenbank sichert eindeutige Namen je
// Elternordner und lässt nur leere Ordner löschen; Zyklen beim Verschieben verhindert verschieben().

type FolderRow = typeof mediaFolders.$inferSelect;

const toFolder = (row: FolderRow, mediaCount = 0, folderCount = 0): MediaFolder => ({
  id: row.id,
  parentId: row.parentId,
  name: row.name,
  mediaCount,
  folderCount,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

function constraintOrThrow(error: unknown): Result<never> {
  if (uniqueViolation(error) === "media_folders_parent_name_unique") {
    return conflict("name_taken", "Hier gibt es schon einen Ordner mit diesem Namen", "name");
  }
  if (foreignKeyViolation(error)) return invalid("parent_unknown", "Der Zielordner existiert nicht", "parentId");
  throw error;
}

/** Alle Ordner als flache Liste, deutsch sortiert; den Baum baut die Oberfläche über parentId. */
export async function listFolders(db: Db): Promise<MediaFolder[]> {
  const mediaCounts = db
    .select({ folderId: media.folderId, n: count().as("media_n") })
    .from(media)
    .groupBy(media.folderId)
    .as("media_counts");
  const children = db
    .select({ parentId: mediaFolders.parentId, n: count().as("folder_n") })
    .from(mediaFolders)
    .groupBy(mediaFolders.parentId)
    .as("children");

  const rows = await db
    .select({ folder: mediaFolders, mediaCount: mediaCounts.n, folderCount: children.n })
    .from(mediaFolders)
    .leftJoin(mediaCounts, eq(mediaCounts.folderId, mediaFolders.id))
    .leftJoin(children, eq(children.parentId, mediaFolders.id));

  return rows.map((r) => toFolder(r.folder, r.mediaCount ?? 0, r.folderCount ?? 0)).sort(byName);
}

export async function createFolder(db: Db, input: CreateFolderInput): Promise<Result<MediaFolder>> {
  try {
    // Eigene (Unter-)Transaktion: Eine Regelverletzung macht sonst eine umgebende Transaktion unbrauchbar.
    const [row] = await db.transaction((tx) =>
      tx.insert(mediaFolders).values({ name: input.name, parentId: input.parentId }).returning(),
    );
    return ok(toFolder(row));
  } catch (error) {
    return constraintOrThrow(error);
  }
}

/** true, wenn folderId der Ordner selbst oder ein Vorfahr von candidateId ist. */
async function isSelfOrAncestor(db: Db, folderId: string, candidateId: string): Promise<boolean> {
  const rows = await db.select({ id: mediaFolders.id, parentId: mediaFolders.parentId }).from(mediaFolders);
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  // Die Schrittgrenze schützt vor einer Endlosschleife, falls die Daten doch einen Zyklus enthalten.
  for (let current: string | null | undefined = candidateId, steps = 0; current && steps <= rows.length; steps++) {
    if (current === folderId) return true;
    current = parentOf.get(current);
  }
  return false;
}

/** Umbenennen und/oder verschieben. */
export async function updateFolder(db: Db, id: string, input: UpdateFolderInput): Promise<Result<MediaFolder>> {
  let row: FolderRow | undefined;
  try {
    const outcome = await db.transaction(async (tx) => {
      if (input.parentId) {
        // Zwei gleichzeitige Verschiebungen (A nach B, B nach A) dürfen keinen Zyklus bilden.
        await tx.execute(sql`LOCK TABLE media_folders IN SHARE ROW EXCLUSIVE MODE`);
        if (await isSelfOrAncestor(tx, id, input.parentId)) return "cycle" as const;
      }
      // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
      const [updated] = await tx
        .update(mediaFolders)
        .set({ name: input.name, parentId: input.parentId, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(mediaFolders.id, id), eq(mediaFolders.updatedAt, new Date(input.updatedAt))))
        .returning();
      return updated;
    });
    if (outcome === "cycle") {
      return invalid("folder_cycle", "Ein Ordner kann nicht in sich selbst oder einen seiner Unterordner", "parentId");
    }
    row = outcome;
  } catch (error) {
    return constraintOrThrow(error);
  }
  if (row) return ok(toFolder(row));

  const [exists] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, id));
  return exists ? conflict("stale", "Der Ordner wurde inzwischen geändert. Bitte neu laden.") : notFound("Ordner");
}

/** Löscht nur leere Ordner (ohne Bilder und Unterordner). */
export async function deleteFolder(db: Db, id: string): Promise<Result<null>> {
  try {
    const [row] = await db.transaction((tx) =>
      tx.delete(mediaFolders).where(eq(mediaFolders.id, id)).returning({ id: mediaFolders.id }),
    );
    return row ? ok(null) : notFound("Ordner");
  } catch (error) {
    if (restrictViolation(error)) {
      return conflict("folder_not_empty", "Der Ordner ist nicht leer. Zuerst Bilder und Unterordner verschieben oder löschen.");
    }
    throw error;
  }
}
