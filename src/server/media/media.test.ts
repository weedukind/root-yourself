import { describe, expect, it } from "vitest";
import { cellElements, cells, elements, posts, rows, tags, versions } from "@/db/schema";
import type { Db } from "@/db/types";
import { withRollback } from "../../../test/db";
import { memoryStorage } from "../../../test/memory-storage";
import { confirmUpload, deleteMedia, listMedia, prepareUpload, updateMedia } from "./media";

const input = { filename: "wurzel.jpg", mimeType: "image/jpeg" as const, size: 1234 };

async function uploaded(db: Db, mem: ReturnType<typeof memoryStorage>) {
  const prepared = await prepareUpload(mem.storage, input);
  if (!prepared.ok) throw new Error(prepared.error.message);
  mem.upload(prepared.value.key, "image/jpeg", 1234);
  const confirmed = await confirmUpload(db, mem.storage, {
    key: prepared.value.key,
    filename: "wurzel.jpg",
    width: 800,
    height: 600,
  });
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  return confirmed.value;
}

async function useInVersion(db: Db, mediaId: string) {
  const [post] = await db.insert(posts).values({ slug: `p-${crypto.randomUUID()}` }).returning();
  const [version] = await db.insert(versions).values({ postId: post.id, number: 1, title: "T" }).returning();
  const [row] = await db.insert(rows).values({ versionId: version.id, position: 0, gridWidth: 1, gridHeight: 1 }).returning();
  const [cell] = await db
    .insert(cells)
    .values({ versionId: version.id, rowId: row.id, position: 0, width: 1, height: 1 })
    .returning();
  const [element] = await db.insert(elements).values({ postId: post.id, type: "image", mediaId }).returning();
  await db.insert(cellElements).values({ cellId: cell.id, versionId: version.id, postId: post.id, position: 0, elementId: element.id });
}

describe("prepareUpload", () => {
  it("vergibt einen Schlüssel nach Jahr/Monat mit passender Endung", async () => {
    const { storage } = memoryStorage();
    const result = await prepareUpload(storage, input, new Date("2026-03-05T12:00:00Z"));
    expect(result).toMatchObject({ ok: true, value: { headers: { "content-type": "image/jpeg" } } });
    if (result.ok) expect(result.value.key).toMatch(/^2026\/03\/[0-9a-f-]{36}\.jpg$/);
  });
});

describe("confirmUpload", () => {
  it("übernimmt Größe und Typ aus dem Speicher, nicht aus der Anfrage", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      expect(medium).toMatchObject({ sizeBytes: 1234, mimeType: "image/jpeg", width: 800, alt: "" });
      expect(medium.url).toBe(`https://media.example/${medium.key}`);
    }));

  it("lehnt fremde Schlüssel ab", () =>
    withRollback(async (db) => {
      const { storage } = memoryStorage();
      const result = await confirmUpload(db, storage, { key: "../geheim.jpg", filename: "x", width: 1, height: 1 });
      expect(result).toMatchObject({ ok: false, error: { code: "key_invalid" } });
    }));

  it("meldet fehlende Uploads", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const prepared = await prepareUpload(mem.storage, input);
      if (!prepared.ok) return;
      const result = await confirmUpload(db, mem.storage, { key: prepared.value.key, filename: "x", width: 1, height: 1 });
      expect(result).toMatchObject({ ok: false, error: { code: "upload_missing" } });
    }));

  it("verwirft Dateien mit falschem Typ und löscht sie aus dem Speicher", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const prepared = await prepareUpload(mem.storage, input);
      if (!prepared.ok) return;
      mem.upload(prepared.value.key, "text/html", 10);
      const result = await confirmUpload(db, mem.storage, { key: prepared.value.key, filename: "x", width: 1, height: 1 });
      expect(result).toMatchObject({ ok: false, error: { code: "upload_invalid" } });
      expect(mem.objects.has(prepared.value.key)).toBe(false);
    }));

  it("registriert eine Datei nur einmal", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      const again = await confirmUpload(db, mem.storage, { key: medium.key, filename: "x", width: 1, height: 1 });
      expect(again).toMatchObject({ ok: false, error: { code: "already_registered" } });
    }));
});

describe("listMedia", () => {
  it("zählt die Versionen, die ein Bild verwenden", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const used = await uploaded(db, mem);
      await uploaded(db, mem);
      await useInVersion(db, used.id);
      const list = await listMedia(db, mem.storage);
      expect(list.map((m) => [m.id === used.id, m.versionCount]).sort()).toEqual([
        [false, 0],
        [true, 1],
      ]);
    }));
});

describe("updateMedia", () => {
  it("ändert den Alt-Text mit Überschreib-Schutz", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      expect(await updateMedia(db, mem.storage, medium.id, { alt: "Wurzel", updatedAt: medium.updatedAt })).toMatchObject({
        ok: true,
        value: { alt: "Wurzel" },
      });
      expect(await updateMedia(db, mem.storage, medium.id, { alt: "Alt", updatedAt: medium.updatedAt })).toMatchObject({
        ok: false,
        error: { code: "stale" },
      });
    }));
});

describe("deleteMedia", () => {
  it("löscht Eintrag und Datei", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      expect(await deleteMedia(db, mem.storage, medium.id)).toEqual({ ok: true, value: null });
      expect(mem.objects.has(medium.key)).toBe(false);
      expect(await deleteMedia(db, mem.storage, medium.id)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));

  it("verweigert das Löschen verwendeter Bilder und behält die Datei", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      await useInVersion(db, medium.id);
      expect(await deleteMedia(db, mem.storage, medium.id)).toMatchObject({ ok: false, error: { code: "media_in_use" } });
      expect(mem.objects.has(medium.key)).toBe(true);
    }));
});

describe("Tags an Medien", () => {
  async function tag(db: Db, name: string) {
    const [row] = await db.insert(tags).values({ name, slug: name.toLowerCase() }).returning();
    return row.id;
  }

  it("setzt und ersetzt die Tags eines Bildes, deutsch sortiert", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      const [wurzeln, aeste, blaetter] = [await tag(db, "Wurzeln"), await tag(db, "Äste"), await tag(db, "Blätter")];

      const first = await updateMedia(db, mem.storage, medium.id, { tagIds: [wurzeln, aeste], updatedAt: medium.updatedAt });
      expect(first.ok && first.value.tags.map((t) => t.name)).toEqual(["Äste", "Wurzeln"]);
      if (!first.ok) return;

      const second = await updateMedia(db, mem.storage, medium.id, { tagIds: [blaetter], updatedAt: first.value.updatedAt });
      expect(second.ok && second.value.tags.map((t) => t.name)).toEqual(["Blätter"]);
      expect(second.ok && second.value.alt).toBe("");
    }));

  it("lehnt unbekannte Tags ab und lässt das Bild unverändert", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      const result = await updateMedia(db, mem.storage, medium.id, {
        alt: "Neu",
        tagIds: [crypto.randomUUID()],
        updatedAt: medium.updatedAt,
      });
      expect(result).toMatchObject({ ok: false, error: { code: "tag_unknown", field: "tagIds" } });
      const [unchanged] = await listMedia(db, mem.storage);
      expect(unchanged).toMatchObject({ alt: "", updatedAt: medium.updatedAt, tags: [] });
    }));

  it("filtert die Mediathek nach Tag", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const tagged = await uploaded(db, mem);
      await uploaded(db, mem);
      const wurzeln = await tag(db, "Wurzeln");
      await updateMedia(db, mem.storage, tagged.id, { tagIds: [wurzeln], updatedAt: tagged.updatedAt });

      expect(await listMedia(db, mem.storage)).toHaveLength(2);
      const filtered = await listMedia(db, mem.storage, { tagId: wurzeln });
      expect(filtered.map((m) => m.id)).toEqual([tagged.id]);
      expect(filtered[0].tags.map((t) => t.name)).toEqual(["Wurzeln"]);
    }));

  it("ein gelöschter Tag verschwindet aus den Medien", () =>
    withRollback(async (db) => {
      const mem = memoryStorage();
      const medium = await uploaded(db, mem);
      const wurzeln = await tag(db, "Wurzeln");
      await updateMedia(db, mem.storage, medium.id, { tagIds: [wurzeln], updatedAt: medium.updatedAt });
      await db.delete(tags);
      const [after] = await listMedia(db, mem.storage);
      expect(after.tags).toEqual([]);
    }));
});
