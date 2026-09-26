import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cellElements, cells, elements, rows, tags, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PostDetail } from "@/shared/api/posts";
import { withRollback } from "../../../test/db";
import { createPost, getPost } from "../posts/posts";
import { deleteVersion, forkVersion, publishVersion, unpublishPost } from "./versions";

async function newPost(db: Db, title = "Wurzeln"): Promise<PostDetail> {
  const result = await createPost(db, { title });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function reload(db: Db, id: string): Promise<PostDetail> {
  const result = await getPost(db, id);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function fork(db: Db, post: PostDetail, versionId: string) {
  const result = await forkVersion(db, post.id, versionId);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Gibt einer Version zwei Rows mit Zellen, zwei Text-Elemente und einen Tag. */
async function furnish(db: Db, postId: string, versionId: string) {
  const [row1, row2] = await db
    .insert(rows)
    .values([
      { versionId, position: 0, gridWidth: 2, gridHeight: 1 },
      { versionId, position: 1, gridWidth: 1, gridHeight: 1 },
    ])
    .returning();
  const [cellA, cellB, cellC] = await db
    .insert(cells)
    .values([
      { versionId, rowId: row1.id, position: 0, width: 1, height: 1 },
      { versionId, rowId: row1.id, position: 1, width: 1, height: 1 },
      { versionId, rowId: row2.id, position: 0, width: 1, height: 1 },
    ])
    .returning();
  const [e1, e2] = await db
    .insert(elements)
    .values([
      { postId, type: "text", data: { markdown: "Eins" } },
      { postId, type: "text", data: { markdown: "Zwei" } },
    ])
    .returning();
  await db.insert(cellElements).values([
    { cellId: cellA.id, versionId, postId, position: 0, elementId: e1.id },
    { cellId: cellC.id, versionId, postId, position: 0, elementId: e2.id },
  ]);
  const [tag] = await db.insert(tags).values({ name: "Baum", slug: "baum" }).returning();
  await db.insert(versionTags).values({ versionId, tagId: tag.id });
  return { cellB, elementIds: [e1.id, e2.id], tagId: tag.id };
}

/** Layout einer Version, unabhängig von IDs der Rows und Zellen. */
async function layoutOf(db: Db, versionId: string) {
  const rowList = await db.select().from(rows).where(eq(rows.versionId, versionId)).orderBy(asc(rows.position));
  const cellList = await db.select().from(cells).where(eq(cells.versionId, versionId));
  const links = await db.select().from(cellElements).where(eq(cellElements.versionId, versionId));
  return rowList.map((row) => ({
    grid: [row.gridWidth, row.gridHeight],
    cells: cellList
      .filter((c) => c.rowId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((c) => links.filter((l) => l.cellId === c.id).map((l) => l.elementId)),
  }));
}

describe("forkVersion", () => {
  it("kopiert Layout und Tags, teilt aber die Elemente", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      const { elementIds, tagId } = await furnish(db, post.id, v1.id);

      const v2 = await fork(db, post, v1.id);
      expect(v2).toMatchObject({ number: 2, parentVersionId: v1.id, title: "Wurzeln", isEditable: true });

      const [original, copy] = [await layoutOf(db, v1.id), await layoutOf(db, v2.id)];
      expect(copy).toEqual(original);
      expect(copy).toEqual([
        { grid: [2, 1], cells: [[elementIds[0]], []] },
        { grid: [1, 1], cells: [[elementIds[1]]] },
      ]);
      // Keine neuen Elemente: dieselben IDs in beiden Versionen.
      expect(await db.select().from(elements).where(eq(elements.postId, post.id))).toHaveLength(2);
      expect(await db.select().from(versionTags).where(eq(versionTags.versionId, v2.id))).toEqual([
        { versionId: v2.id, tagId },
      ]);
    }));

  it("macht die Quelle zum eingefrorenen inneren Knoten und erlaubt Forks von eingefrorenen Versionen", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      await fork(db, post, v1.id);
      const v3 = await fork(db, post, v1.id); // Geschwister von v2
      expect(v3).toMatchObject({ number: 3, parentVersionId: v1.id });

      const tree = (await reload(db, post.id)).versions;
      expect(tree.map((v) => [v.number, v.isLeaf, v.isEditable])).toEqual([
        [1, false, false],
        [2, true, true],
        [3, true, true],
      ]);
    }));

  it("meldet Versionen, die nicht zum Post gehören", () =>
    withRollback(async (db) => {
      const a = await newPost(db, "A");
      const b = await newPost(db, "B");
      expect(await forkVersion(db, a.id, b.versions[0].id)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));
});

describe("publishVersion", () => {
  it("veröffentlicht, setzt first_published_at nur beim ersten Mal und erlaubt Rollback", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      const v2 = await fork(db, post, v1.id);

      const first = await publishVersion(db, post.id, v2.id);
      if (!first.ok) throw new Error(first.error.message);
      expect(first.value.publishedVersion).toMatchObject({ id: v2.id, number: 2 });
      const firstPublishedAt = first.value.firstPublishedAt;
      expect(firstPublishedAt).not.toBeNull();

      // Rollback auf v1: höchstens eine Version ist veröffentlicht.
      const rollback = await publishVersion(db, post.id, v1.id);
      if (!rollback.ok) throw new Error(rollback.error.message);
      expect(rollback.value.versions.filter((v) => v.isPublished).map((v) => v.number)).toEqual([1]);
      expect(rollback.value.firstPublishedAt).toBe(firstPublishedAt);
      // v2 behält den Zeitpunkt seiner letzten Veröffentlichung.
      expect(rollback.value.versions.find((v) => v.id === v2.id)?.publishedAt).not.toBeNull();
    }));

  it("ein veröffentlichtes Blatt ist nicht bearbeitbar", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const result = await publishVersion(db, post.id, post.versions[0].id);
      expect(result.ok && result.value.versions[0]).toMatchObject({ isLeaf: true, isPublished: true, isEditable: false });
    }));
});

describe("unpublishPost", () => {
  it("zieht die Veröffentlichung zurück und behält first_published_at", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      await publishVersion(db, post.id, post.versions[0].id);
      const result = await unpublishPost(db, post.id);
      expect(result).toMatchObject({ ok: true, value: { publishedVersion: null } });
      expect(result.ok && result.value.firstPublishedAt).not.toBeNull();
      expect(result.ok && result.value.versions[0].isEditable).toBe(true);
    }));
});

describe("deleteVersion", () => {
  it("löscht ein unveröffentlichtes Blatt und räumt nur dessen eigene Elemente auf", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      const { cellB, elementIds } = await furnish(db, post.id, v1.id);
      const v2 = await fork(db, post, v1.id);

      // v2 bekommt ein eigenes Element zusätzlich zu den geteilten.
      const [own] = await db.insert(elements).values({ postId: post.id, type: "text", data: { markdown: "Nur v2" } }).returning();
      // Gegenstück zu cellB in v2: die einzige Zelle mit Position 1.
      const [v2CellB] = await db
        .select()
        .from(cells)
        .where(and(eq(cells.versionId, v2.id), eq(cells.position, cellB.position)));
      await db.insert(cellElements).values({ cellId: v2CellB.id, versionId: v2.id, postId: post.id, position: 0, elementId: own.id });

      expect(await deleteVersion(db, post.id, v2.id)).toEqual({ ok: true, value: null });
      const remaining = await db.select({ id: elements.id }).from(elements).where(eq(elements.postId, post.id));
      expect(remaining.map((e) => e.id).sort()).toEqual([...elementIds].sort());
      // v1 ist wieder ein bearbeitbares Blatt.
      expect((await reload(db, post.id)).versions).toEqual([expect.objectContaining({ number: 1, isEditable: true })]);
    }));

  it("verweigert veröffentlichte Versionen, innere Knoten und die letzte Version", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      expect(await deleteVersion(db, post.id, v1.id)).toMatchObject({ ok: false, error: { code: "last_version" } });

      const v2 = await fork(db, post, v1.id);
      expect(await deleteVersion(db, post.id, v1.id)).toMatchObject({ ok: false, error: { code: "version_has_children" } });

      await publishVersion(db, post.id, v2.id);
      expect(await deleteVersion(db, post.id, v2.id)).toMatchObject({ ok: false, error: { code: "version_published" } });
      expect(await db.select().from(versions).where(eq(versions.postId, post.id))).toHaveLength(2);
    }));
});
