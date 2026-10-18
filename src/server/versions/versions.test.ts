import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { elements, tags, versionElements, versions, versionTags } from "@/db/schema";
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

/** Gibt der Seite einer Version einen Text und eine Liste mit einem Text darin, dazu einen Tag. */
async function furnish(db: Db, postId: string, versionId: string) {
  const [root] = await db.select().from(versionElements).where(eq(versionElements.versionId, versionId));
  const [e1, list, e2] = await db
    .insert(elements)
    .values([
      { postId, type: "text", data: { markdown: "Eins" } },
      { postId, type: "list", data: { orientation: "vertical" } },
      { postId, type: "text", data: { markdown: "Zwei" } },
    ])
    .returning();
  const link = { versionId, postId };
  await db.insert(versionElements).values([
    { ...link, elementId: e1.id, parentElementId: root.elementId, position: 0 },
    { ...link, elementId: list.id, parentElementId: root.elementId, position: 1 },
    { ...link, elementId: e2.id, parentElementId: list.id, position: 0 },
  ]);
  const [tag] = await db.insert(tags).values({ name: "Baum", slug: "baum" }).returning();
  await db.insert(versionTags).values({ versionId, tagId: tag.id });
  return { rootId: root.elementId, elementIds: [root.elementId, e1.id, list.id, e2.id], tagId: tag.id };
}

/** Baum einer Version als [Element, Elternteil, Position], sortiert. */
async function treeOf(db: Db, versionId: string) {
  const links = await db.select().from(versionElements).where(eq(versionElements.versionId, versionId));
  return links.map((l) => [l.elementId, l.parentElementId, l.position]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

describe("forkVersion", () => {
  it("kopiert Elementbaum und Tags, teilt aber die Elemente", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = post.versions[0];
      const { elementIds, tagId } = await furnish(db, post.id, v1.id);

      const v2 = await fork(db, post, v1.id);
      expect(v2).toMatchObject({ number: 2, parentVersionId: v1.id, title: "Wurzeln", isEditable: true });

      const [original, copy] = [await treeOf(db, v1.id), await treeOf(db, v2.id)];
      expect(copy).toEqual(original);
      expect(copy).toHaveLength(4);
      // Keine neuen Elemente: dieselben IDs in beiden Versionen (Seite, Text, Liste, Text).
      expect(await db.select().from(elements).where(eq(elements.postId, post.id))).toHaveLength(elementIds.length);
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
      const { rootId, elementIds } = await furnish(db, post.id, v1.id);
      const v2 = await fork(db, post, v1.id);

      // v2 bekommt ein eigenes Element zusätzlich zu den geteilten.
      const [own] = await db.insert(elements).values({ postId: post.id, type: "text", data: { markdown: "Nur v2" } }).returning();
      await db
        .insert(versionElements)
        .values({ versionId: v2.id, postId: post.id, elementId: own.id, parentElementId: rootId, position: 2 });

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
