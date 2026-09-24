import { describe, expect, it } from "vitest";
import { posts, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { withRollback } from "../../../test/db";
import { createTag, deleteTag, listTags, updateTag } from "./tags";

async function create(db: Db, name: string) {
  const result = await createTag(db, { name });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("createTag", () => {
  it("erzeugt den Slug aus dem Namen", () =>
    withRollback(async (db) => {
      const tag = await create(db, "Über Wurzeln");
      expect(tag).toMatchObject({ name: "Über Wurzeln", slug: "ueber-wurzeln" });
    }));

  it("lehnt doppelte Namen ab", () =>
    withRollback(async (db) => {
      await create(db, "Wurzeln");
      const result = await createTag(db, { name: "Wurzeln" });
      expect(result).toMatchObject({ ok: false, error: { code: "name_taken", field: "name" } });
    }));

  it("lehnt Namen ab, die denselben Slug ergeben", () =>
    withRollback(async (db) => {
      await create(db, "Café");
      const result = await createTag(db, { name: "cafe" });
      expect(result).toMatchObject({ ok: false, error: { code: "slug_taken" } });
    }));

  it("lehnt Namen ohne verwertbare Zeichen ab", () =>
    withRollback(async (db) => {
      const result = await createTag(db, { name: "!!!" });
      expect(result).toMatchObject({ ok: false, error: { kind: "invalid", code: "slug_empty" } });
    }));

  it("die umgebende Transaktion bleibt nach einem Konflikt benutzbar", () =>
    withRollback(async (db) => {
      await create(db, "Wurzeln");
      await createTag(db, { name: "Wurzeln" });
      expect(await listTags(db)).toHaveLength(1);
    }));
});

describe("updateTag", () => {
  it("benennt um und behält den Slug", () =>
    withRollback(async (db) => {
      const tag = await create(db, "Wurzeln");
      const result = await updateTag(db, tag.id, { name: "Wurzelwerk", updatedAt: tag.updatedAt });
      expect(result).toMatchObject({ ok: true, value: { name: "Wurzelwerk", slug: "wurzeln" } });
      if (result.ok) expect(result.value.updatedAt).not.toBe(tag.updatedAt);
    }));

  it("ändert den Slug nur ausdrücklich und prüft ihn", () =>
    withRollback(async (db) => {
      const tag = await create(db, "Wurzeln");
      expect(await updateTag(db, tag.id, { slug: "Neu Slug", updatedAt: tag.updatedAt })).toMatchObject({
        ok: false,
        error: { code: "slug_invalid", field: "slug" },
      });
      expect(await updateTag(db, tag.id, { slug: "wurzelwerk", updatedAt: tag.updatedAt })).toMatchObject({
        ok: true,
        value: { slug: "wurzelwerk" },
      });
    }));

  it("verhindert das Überschreiben einer zwischenzeitlichen Änderung", () =>
    withRollback(async (db) => {
      const tag = await create(db, "Wurzeln");
      expect((await updateTag(db, tag.id, { name: "A", updatedAt: tag.updatedAt })).ok).toBe(true);
      // Zweiter Tab mit dem alten Stand:
      const result = await updateTag(db, tag.id, { name: "B", updatedAt: tag.updatedAt });
      expect(result).toMatchObject({ ok: false, error: { kind: "conflict", code: "stale" } });
    }));

  it("meldet doppelte Namen als Konflikt", () =>
    withRollback(async (db) => {
      await create(db, "Wurzeln");
      const tag = await create(db, "Äste");
      const result = await updateTag(db, tag.id, { name: "Wurzeln", updatedAt: tag.updatedAt });
      expect(result).toMatchObject({ ok: false, error: { code: "name_taken" } });
    }));

  it("meldet unbekannte Tags", () =>
    withRollback(async (db) => {
      const result = await updateTag(db, crypto.randomUUID(), { name: "X", updatedAt: new Date().toISOString() });
      expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));
});

describe("deleteTag", () => {
  it("löscht den Tag", () =>
    withRollback(async (db) => {
      const tag = await create(db, "Wurzeln");
      expect(await deleteTag(db, tag.id)).toEqual({ ok: true, value: null });
      expect(await listTags(db)).toEqual([]);
      expect(await deleteTag(db, tag.id)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));
});

describe("listTags", () => {
  it("zählt Posts insgesamt und veröffentlichte Posts, sortiert nach Name", () =>
    withRollback(async (db) => {
      const wurzeln = await create(db, "Wurzeln");
      await create(db, "Äste");

      // Post 1: veröffentlicht, zwei Versionen mit dem Tag (zählt trotzdem einmal).
      const [p1] = await db.insert(posts).values({ slug: "p1" }).returning();
      const [v1] = await db.insert(versions).values({ postId: p1.id, number: 1, title: "1" }).returning();
      const [v2] = await db
        .insert(versions)
        .values({ postId: p1.id, number: 2, parentVersionId: v1.id, title: "2" })
        .returning();
      await db.insert(versionTags).values([
        { versionId: v1.id, tagId: wurzeln.id },
        { versionId: v2.id, tagId: wurzeln.id },
      ]);
      await db.update(posts).set({ publishedVersionId: v1.id, firstPublishedAt: new Date() });

      // Post 2: nur Entwurf mit dem Tag.
      const [p2] = await db.insert(posts).values({ slug: "p2" }).returning();
      const [v3] = await db.insert(versions).values({ postId: p2.id, number: 1, title: "3" }).returning();
      await db.insert(versionTags).values({ versionId: v3.id, tagId: wurzeln.id });

      const list = await listTags(db);
      expect(list.map((t) => [t.name, t.postCount, t.publishedPostCount])).toEqual([
        ["Äste", 0, 0],
        ["Wurzeln", 2, 1],
      ]);
    }));
});
