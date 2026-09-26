import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { elements, media, tags, versions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PostDetail } from "@/shared/api/posts";
import {
  saveVersionInput,
  type ElementInput,
  type SaveVersionInput,
  type VersionDetail,
} from "@/shared/api/versions";
import { withRollback } from "../../../test/db";
import { memoryStorage } from "../../../test/memory-storage";
import { createPost } from "../posts/posts";
import { getVersion, saveVersion } from "./content";
import { forkVersion, publishVersion } from "./versions";

const { storage } = memoryStorage();

async function newPost(db: Db): Promise<PostDetail> {
  const result = await createPost(db, { title: "Wurzeln" });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function load(db: Db, postId: string, versionId: string): Promise<VersionDetail> {
  const result = await getVersion(db, storage, postId, versionId);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Eingabe aus einer geladenen Version – so, wie der Editor sie zurückschicken würde. */
function toInput(version: VersionDetail, patch: Partial<SaveVersionInput> = {}): SaveVersionInput {
  return {
    title: version.title,
    tagIds: version.tags.map((t) => t.id),
    rows: version.rows.map((row) => ({
      gridWidth: row.gridWidth,
      gridHeight: row.gridHeight,
      cells: row.cells.map((cell) => ({
        width: cell.width,
        height: cell.height,
        elements: cell.elements.map((e): ElementInput =>
          e.type === "image" ? { id: e.id, type: e.type, data: e.data, mediaId: e.mediaId } : { id: e.id, type: e.type, data: e.data } as ElementInput,
        ),
      })),
    })),
    updatedAt: version.updatedAt,
    ...patch,
  };
}

const text = (markdown: string, id?: string): ElementInput => ({ id, type: "text", data: { markdown } });

/** Eine Row 2×1 mit zwei Zellen: links zwei Texte, rechts einer. */
const twoColumns = (left: ElementInput[], right: ElementInput[]) => [
  {
    gridWidth: 2,
    gridHeight: 1,
    cells: [
      { width: 1, height: 1, elements: left },
      { width: 1, height: 1, elements: right },
    ],
  },
];

async function save(db: Db, postId: string, versionId: string, input: SaveVersionInput) {
  const result = await saveVersion(db, storage, postId, versionId, input);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** Legt v1 mit Inhalt an und liefert den gespeicherten Stand. */
async function furnished(db: Db) {
  const post = await newPost(db);
  const v1 = await load(db, post.id, post.versions[0].id);
  const saved = await save(db, post.id, v1.id, toInput(v1, { rows: twoColumns([text("Eins"), text("Zwei")], [text("Drei")]) }));
  return { post, v1: saved.version };
}

const texts = (version: VersionDetail) =>
  version.rows.map((r) => r.cells.map((c) => c.elements.map((e) => (e.type === "text" ? e.data.markdown : e.type))));
const idsOf = (version: VersionDetail) => version.rows.flatMap((r) => r.cells.flatMap((c) => c.elements.map((e) => e.id)));
const elementCount = async (db: Db, postId: string) =>
  (await db.select({ id: elements.id }).from(elements).where(eq(elements.postId, postId))).length;

describe("saveVersion – unveröffentlichtes Blatt", () => {
  it("speichert Titel, Tags und Layout", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const [tag] = await db.insert(tags).values({ name: "Baum", slug: "baum" }).returning();
      const v1 = await load(db, post.id, post.versions[0].id);

      const { version, forkedFrom } = await save(
        db,
        post.id,
        v1.id,
        toInput(v1, { title: "Neuer Titel", tagIds: [tag.id], rows: twoColumns([text("Eins")], []) }),
      );
      expect(forkedFrom).toBeNull();
      expect(version).toMatchObject({ id: v1.id, title: "Neuer Titel", tags: [{ name: "Baum" }] });
      expect(texts(version)).toEqual([[["Eins"], []]]);
      expect(version.updatedAt).not.toBe(v1.updatedAt);
      expect(await load(db, post.id, v1.id)).toEqual(version);
    }));

  it("unverändert zurückgeschickt entstehen keine neuen Elemente", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const { version } = await save(db, post.id, v1.id, toInput(v1));
      expect(idsOf(version)).toEqual(idsOf(v1));
      expect(await elementCount(db, post.id)).toBe(3);
    }));

  it("ändert nicht geteilte Elemente direkt – die ID bleibt", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one, two, three] = idsOf(v1);
      const { version } = await save(db, post.id, v1.id, toInput(v1, { rows: twoColumns([text("Eins!", one), text("Zwei", two)], [text("Drei", three)]) }));
      expect(idsOf(version)).toEqual([one, two, three]);
      expect(texts(version)).toEqual([[["Eins!", "Zwei"], ["Drei"]]]);
      expect(await elementCount(db, post.id)).toBe(3);
    }));

  it("erlaubt auch einen Typwechsel im selben Element", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one, two, three] = idsOf(v1);
      const heading: ElementInput = { id: one, type: "heading", data: { level: 2, text: "Überschrift" } };
      const { version } = await save(db, post.id, v1.id, toInput(v1, { rows: twoColumns([heading, text("Zwei", two)], [text("Drei", three)]) }));
      expect(version.rows[0].cells[0].elements[0]).toEqual({ id: one, type: "heading", data: { level: 2, text: "Überschrift" } });
    }));

  it("Umsortieren und Verschieben zwischen Zellen erzeugen keine neuen Elemente", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one, two, three] = idsOf(v1);
      const { version } = await save(db, post.id, v1.id, toInput(v1, { rows: twoColumns([text("Drei", three)], [text("Zwei", two), text("Eins", one)]) }));
      expect(idsOf(version)).toEqual([three, two, one]);
      expect(await elementCount(db, post.id)).toBe(3);
    }));

  it("entfernte, nicht geteilte Elemente werden aufgeräumt", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one] = idsOf(v1);
      await save(db, post.id, v1.id, toInput(v1, { rows: twoColumns([text("Eins", one)], []) }));
      expect(await elementCount(db, post.id)).toBe(1);
    }));

  it("liefert Bild-Elemente mit ihrem Medium", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const [image] = await db
        .insert(media)
        .values({ storageKey: "2026/09/bild.png", filename: "bild.png", mimeType: "image/png", sizeBytes: 1, width: 40, height: 30, alt: "Ein Bild" })
        .returning();
      const v1 = await load(db, post.id, post.versions[0].id);
      const { version } = await save(db, post.id, v1.id, toInput(v1, {
        rows: twoColumns([{ type: "image", data: { caption: "Unterschrift" }, mediaId: image.id }], []),
      }));
      expect(version.rows[0].cells[0].elements[0]).toMatchObject({
        type: "image",
        data: { caption: "Unterschrift" },
        media: { id: image.id, url: "https://media.example/2026/09/bild.png", width: 40, alt: "Ein Bild" },
      });
    }));
});

describe("saveVersion – geteilte Elemente (Copy-on-Write)", () => {
  it("klont ein geändertes geteiltes Element; die Elternversion bleibt unverändert", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      const [one, two, three] = idsOf(v2);

      const { version } = await save(db, post.id, v2.id, toInput(v2, { rows: twoColumns([text("Eins in v2", one), text("Zwei", two)], [text("Drei", three)]) }));
      const [newOne, sharedTwo, sharedThree] = idsOf(version);
      expect(newOne).not.toBe(one);
      expect([sharedTwo, sharedThree]).toEqual([two, three]);
      expect(texts(await load(db, post.id, v1.id))).toEqual([[["Eins", "Zwei"], ["Drei"]]]);
      expect(await elementCount(db, post.id)).toBe(4);

      // Der Klon gehört nur v2 – eine weitere Änderung geht direkt in ihn.
      const again = await save(db, post.id, v2.id, toInput(version, { rows: twoColumns([text("Eins, zweite Änderung", newOne)], []) }));
      expect(idsOf(again.version)).toEqual([newOne]);
    }));

  it("entfernte geteilte Elemente bleiben für die anderen Versionen erhalten", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      await save(db, post.id, v2.id, toInput(v2, { rows: [] }));
      expect(await elementCount(db, post.id)).toBe(3);
      expect(texts(await load(db, post.id, v1.id))).toEqual([[["Eins", "Zwei"], ["Drei"]]]);
    }));
});

describe("saveVersion – veröffentlichte und eingefrorene Versionen", () => {
  it("veröffentlichte Version: Änderungen landen automatisch in einem Fork", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await publishVersion(db, post.id, v1.id);
      const published = await load(db, post.id, v1.id);
      const [one, two, three] = idsOf(published);

      const { version, forkedFrom } = await save(
        db,
        post.id,
        v1.id,
        toInput(published, { title: "Überarbeitet", rows: twoColumns([text("Eins!", one), text("Zwei", two)], [text("Drei", three)]) }),
      );
      expect(forkedFrom).toBe(v1.id);
      expect(version).toMatchObject({ number: 2, parentVersionId: v1.id, title: "Überarbeitet", isEditable: true });
      // Geändertes Element geklont, unveränderte geteilt.
      const [newOne, sharedTwo, sharedThree] = idsOf(version);
      expect(newOne).not.toBe(one);
      expect([sharedTwo, sharedThree]).toEqual([two, three]);
      // Die veröffentlichte Version ist unverändert.
      expect(await load(db, post.id, v1.id)).toEqual({ ...published, isLeaf: false });
    }));

  it("lehnt eingefrorene innere Knoten ab und ändert nichts", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await forkVersion(db, post.id, v1.id);
      const result = await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "Geändert" }));
      expect(result).toMatchObject({ ok: false, error: { code: "version_frozen" } });
      expect((await load(db, post.id, v1.id)).title).toBe("Wurzeln");
    }));
});

describe("saveVersion – Fehler", () => {
  it("verhindert das Überschreiben einer zwischenzeitlichen Änderung", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await save(db, post.id, v1.id, toInput(v1, { title: "Tab A" }));
      const result = await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "Tab B" }));
      expect(result).toMatchObject({ ok: false, error: { code: "version_conflict" } });
    }));

  it("lehnt Elemente anderer Versionen ab, ohne einen Fork übrig zu lassen", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      // Geschwister-Version mit eigenem Element.
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      const { version: v2saved } = await save(db, post.id, v2.id, toInput(v2, { rows: twoColumns([text("Nur v2")], []) }));
      const foreignId = idsOf(v2saved)[0];

      const sibling = await forkVersion(db, post.id, v1.id);
      if (!sibling.ok) throw new Error(sibling.error.message);
      await publishVersion(db, post.id, sibling.value.id);
      const v3 = await load(db, post.id, sibling.value.id);
      const result = await saveVersion(db, storage, post.id, v3.id, toInput(v3, { rows: twoColumns([text("x", foreignId)], []) }));
      expect(result).toMatchObject({ ok: false, error: { code: "element_unknown" } });
      expect(await db.select().from(versions).where(eq(versions.postId, post.id))).toHaveLength(3);
    }));

  it("unbekannte Tags und Bilder: Fehler, und die Version bleibt unverändert", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      expect(
        await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "X", tagIds: [crypto.randomUUID()] })),
      ).toMatchObject({ ok: false, error: { code: "tag_unknown" } });
      expect(
        await saveVersion(db, storage, post.id, v1.id, toInput(v1, {
          title: "X",
          rows: twoColumns([{ type: "image", data: {}, mediaId: crypto.randomUUID() }], []),
        })),
      ).toMatchObject({ ok: false, error: { code: "media_unknown" } });
      expect(await load(db, post.id, v1.id)).toEqual(v1);
    }));

  it("meldet unbekannte Versionen", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = await load(db, post.id, post.versions[0].id);
      expect(await saveVersion(db, storage, post.id, crypto.randomUUID(), toInput(v1))).toMatchObject({
        ok: false,
        error: { kind: "not_found" },
      });
    }));
});

describe("saveVersionInput", () => {
  const base = { title: "T", tagIds: [], updatedAt: new Date().toISOString() };

  it("prüft Zellgrößen gegen das Grid", () => {
    const result = saveVersionInput.safeParse({
      ...base,
      rows: [{ gridWidth: 2, gridHeight: 1, cells: [{ width: 3, height: 1, elements: [] }] }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["rows", 0, "cells", 0, "width"], message: "Zelle ist breiter als das Grid" });
  });

  it("lehnt Rows ab, deren Zellen nicht ins Grid passen", () => {
    const cells = (widths: number[]) => widths.map((width) => ({ width, height: 1, elements: [] }));
    const row = (widths: number[]) => ({ ...base, rows: [{ gridWidth: 3, gridHeight: 2, cells: cells(widths) }] });
    expect(saveVersionInput.safeParse(row([1, 1, 1, 1, 1, 1])).success).toBe(true);
    const tooMany = saveVersionInput.safeParse(row([2, 1, 1, 1, 1, 1]));
    expect(tooMany.error?.issues[0]).toMatchObject({
      path: ["rows", 0, "cells"],
      message: "Die Zellen passen nicht in das Grid (2 Zeilen)",
    });
  });

  it("lehnt doppelt verwendete Elemente ab", () => {
    const id = crypto.randomUUID();
    const result = saveVersionInput.safeParse({ ...base, rows: twoColumns([text("a", id)], [text("b", id)]) });
    expect(result.success).toBe(false);
  });
});
