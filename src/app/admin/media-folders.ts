import { byName } from "@/lib/sort";
import type { MediaFolder } from "@/shared/api/media";

// Ordnerbaum der Mediathek aus der flachen Liste von GET /api/admin/media/folders.

/** Direkte Unterordner, deutsch sortiert; parentId null: oberste Ebene. */
export function childrenOf(folders: MediaFolder[], parentId: string | null): MediaFolder[] {
  return folders.filter((f) => f.parentId === parentId).sort(byName);
}

/** Der Weg von der obersten Ebene bis zum Ordner selbst; leer, wenn es ihn nicht gibt. */
export function pathOf(folders: MediaFolder[], id: string | null): MediaFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: MediaFolder[] = [];
  for (let current = id ? byId.get(id) : undefined; current && path.length <= folders.length; ) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export const pathLabel = (folders: MediaFolder[], id: string | null) =>
  pathOf(folders, id)
    .map((f) => f.name)
    .join(" / ");

/** Der Ordner und alle darunter: Ziele, in die er nicht verschoben werden kann. */
export function subtreeIds(folders: MediaFolder[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let added = true; added; ) {
    added = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return ids;
}

export type FolderOption = { id: string; label: string; depth: number };

/** Alle Ordner in Baumreihenfolge (für Auswahllisten), ohne die ausgeschlossenen samt Unterordnern. */
export function folderOptions(folders: MediaFolder[], exclude: Set<string> = new Set()): FolderOption[] {
  const options: FolderOption[] = [];
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const f of childrenOf(folders, parentId)) {
      if (exclude.has(f.id)) continue;
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      options.push({ id: f.id, label, depth });
      visit(f.id, depth + 1, label);
    }
  };
  visit(null, 0, "");
  return options;
}

/**
 * Darf der Ordner unter targetId (null: oberste Ebene) verschoben werden? Nicht in sich selbst,
 * nicht in eigene Unterordner und nicht dorthin, wo er schon liegt.
 */
export function canMoveFolder(folders: MediaFolder[], folderId: string, targetId: string | null): boolean {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder || folder.parentId === targetId) return false;
  return targetId === null || !subtreeIds(folders, folderId).has(targetId);
}
