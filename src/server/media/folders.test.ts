import { describe, expect, it } from "vitest";
import { media } from "@/db/schema";
import type { Db } from "@/db/types";
import type { MediaFolder } from "@/shared/api/media";
import { withRollback } from "../../../test/db";
import { createFolder, deleteFolder, listFolders, updateFolder } from "./folders";

async function folder(db: Db, name: string, parentId: string | null = null): Promise<MediaFolder> {
  const result = await createFolder(db, { name, parentId });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function addImage(db: Db, folderId: string) {
  await db.insert(media).values({
    folderId,
    storageKey: crypto.randomUUID(),
    filename: "bild.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1,
    width: 1,
    height: 1,
  });
}

describe("createFolder", () => {
  it("legt Ordner auf der obersten Ebene und verschachtelt an", () =>
    withRollback(async (db) => {
      const reisen = await folder(db, "Reisen");
      const island = await folder(db, "Island", reisen.id);
      expect(island).toMatchObject({ name: "Island", parentId: reisen.id });
    }));

  it("Namen sind je Elternordner eindeutig, auch auf der obersten Ebene", () =>
    withRollback(async (db) => {
      const a = await folder(db, "A");
      const b = await folder(db, "B");
      await folder(db, "Fotos", a.id);
      expect(await folder(db, "Fotos", b.id)).toMatchObject({ parentId: b.id });

      expect(await createFolder(db, { name: "Fotos", parentId: a.id })).toMatchObject({
        ok: false,
        error: { code: "name_taken", field: "name" },
      });
      expect(await createFolder(db, { name: "A", parentId: null })).toMatchObject({
        ok: false,
        error: { code: "name_taken" },
      });
    }));

  it("lehnt einen unbekannten Elternordner ab", () =>
    withRollback(async (db) => {
      expect(await createFolder(db, { name: "X", parentId: crypto.randomUUID() })).toMatchObject({
        ok: false,
        error: { code: "parent_unknown", field: "parentId" },
      });
    }));
});

describe("listFolders", () => {
  it("zählt Bilder und Unterordner direkt im Ordner, deutsch sortiert", () =>
    withRollback(async (db) => {
      const reisen = await folder(db, "Reisen");
      const island = await folder(db, "Island", reisen.id);
      await folder(db, "Äpfel");
      await addImage(db, island.id);
      await addImage(db, island.id);

      const list = await listFolders(db);
      expect(list.map((f) => [f.name, f.mediaCount, f.folderCount])).toEqual([
        ["Äpfel", 0, 0],
        ["Island", 2, 0],
        ["Reisen", 0, 1],
      ]);
    }));
});

describe("updateFolder", () => {
  it("benennt um und verschiebt, mit Überschreib-Schutz", () =>
    withRollback(async (db) => {
      const reisen = await folder(db, "Reisen");
      const island = await folder(db, "Island");

      const moved = await updateFolder(db, island.id, { name: "Island 2026", parentId: reisen.id, updatedAt: island.updatedAt });
      expect(moved).toMatchObject({ ok: true, value: { name: "Island 2026", parentId: reisen.id } });
      expect(await updateFolder(db, island.id, { name: "X", updatedAt: island.updatedAt })).toMatchObject({
        ok: false,
        error: { code: "stale" },
      });

      if (!moved.ok) return;
      const back = await updateFolder(db, island.id, { parentId: null, updatedAt: moved.value.updatedAt });
      expect(back).toMatchObject({ ok: true, value: { parentId: null } });
    }));

  it("verhindert Zyklen: nicht in sich selbst, nicht in eigene Unterordner", () =>
    withRollback(async (db) => {
      const a = await folder(db, "A");
      const b = await folder(db, "B", a.id);
      const c = await folder(db, "C", b.id);

      for (const target of [a, b, c]) {
        expect(await updateFolder(db, a.id, { parentId: target.id, updatedAt: a.updatedAt })).toMatchObject({
          ok: false,
          error: { code: "folder_cycle", field: "parentId" },
        });
      }
      // Seitwärts und nach oben geht.
      expect(await updateFolder(db, c.id, { parentId: a.id, updatedAt: c.updatedAt })).toMatchObject({ ok: true });
    }));

  it("meldet Namenskonflikte im Zielordner und unbekannte Ordner", () =>
    withRollback(async (db) => {
      const a = await folder(db, "A");
      await folder(db, "Fotos", a.id);
      const other = await folder(db, "Fotos");

      expect(await updateFolder(db, other.id, { parentId: a.id, updatedAt: other.updatedAt })).toMatchObject({
        ok: false,
        error: { code: "name_taken" },
      });
      expect(await updateFolder(db, other.id, { parentId: crypto.randomUUID(), updatedAt: other.updatedAt })).toMatchObject({
        ok: false,
        error: { code: "parent_unknown" },
      });
      expect(await updateFolder(db, crypto.randomUUID(), { name: "X", updatedAt: other.updatedAt })).toMatchObject({
        ok: false,
        error: { kind: "not_found" },
      });
    }));
});

describe("deleteFolder", () => {
  it("löscht nur leere Ordner", () =>
    withRollback(async (db) => {
      const parent = await folder(db, "Eltern");
      const child = await folder(db, "Kind", parent.id);
      const withImage = await folder(db, "Mit Bild");
      await addImage(db, withImage.id);

      expect(await deleteFolder(db, parent.id)).toMatchObject({ ok: false, error: { code: "folder_not_empty" } });
      expect(await deleteFolder(db, withImage.id)).toMatchObject({ ok: false, error: { code: "folder_not_empty" } });
      expect(await deleteFolder(db, child.id)).toEqual({ ok: true, value: null });
      expect(await deleteFolder(db, parent.id)).toEqual({ ok: true, value: null });
      expect(await deleteFolder(db, parent.id)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));
});
