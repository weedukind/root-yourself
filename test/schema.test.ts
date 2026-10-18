import { count, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { elements, media, posts, tags, versionElements, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { createFolder, expectDbError, withRollback } from "./db";

// Prüft die Regeln, die die Datenbank selbst durchsetzt (docs/concept.md, „Datenbankschema“).

const FK_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const RESTRICT_VIOLATION = "23001";

let counter = 0;

async function createPost(db: Db) {
  const [post] = await db.insert(posts).values({ slug: `post-${++counter}` }).returning();
  const [version] = await db
    .insert(versions)
    .values({ postId: post.id, number: 1, title: "Titel" })
    .returning();
  return { postId: post.id, versionId: version.id };
}

async function createFork(db: Db, postId: string, parentVersionId: string, number: number) {
  const [version] = await db
    .insert(versions)
    .values({ postId, number, parentVersionId, title: "Fork" })
    .returning();
  return version.id;
}

async function createTextElement(db: Db, postId: string) {
  const [element] = await db
    .insert(elements)
    .values({ postId, type: "text", data: { markdown: "Hallo" } })
    .returning();
  return element.id;
}

/** Hängt ein Element in den Baum einer Version; ohne parent als Wurzel. */
async function link(
  db: Db,
  v: { postId: string; versionId: string },
  elementId: string,
  { parent = null, position = 0 }: { parent?: string | null; position?: number } = {},
) {
  await db.insert(versionElements).values({ ...v, elementId, parentElementId: parent, position });
}

describe("Posts und Versionen", () => {
  it("die veröffentlichte Version muss zum eigenen Post gehören", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const b = await createPost(db);
      const code = await expectDbError(db, (tx) =>
        tx
          .update(posts)
          .set({ publishedVersionId: b.versionId, firstPublishedAt: new Date() })
          .where(eq(posts.id, a.postId)),
      );
      expect(code).toBe(FK_VIOLATION);
    }));

  it("veröffentlicht ohne first_published_at ist nicht möglich", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const code = await expectDbError(db, (tx) =>
        tx.update(posts).set({ publishedVersionId: a.versionId }).where(eq(posts.id, a.postId)),
      );
      expect(code).toBe(CHECK_VIOLATION);
    }));

  it("die veröffentlichte Version lässt sich nicht löschen", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      await db
        .update(posts)
        .set({ publishedVersionId: a.versionId, firstPublishedAt: new Date() })
        .where(eq(posts.id, a.postId));
      const code = await expectDbError(db, (tx) => tx.delete(versions).where(eq(versions.id, a.versionId)));
      expect(code).toBe(FK_VIOLATION);
    }));

  it("die Elternversion muss zum selben Post gehören", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const b = await createPost(db);
      const code = await expectDbError(db, (tx) => createFork(tx, a.postId, b.versionId, 2));
      expect(code).toBe(FK_VIOLATION);
    }));

  it("Versionsnummern sind pro Post eindeutig", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const code = await expectDbError(db, (tx) => createFork(tx, a.postId, a.versionId, 1));
      expect(code).toBe(UNIQUE_VIOLATION);
    }));
});

describe("Elementbaum", () => {
  it("genau eine Wurzel pro Version", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      await link(db, a, await createTextElement(db, a.postId));
      const code = await expectDbError(db, async (tx) => link(tx, a, await createTextElement(tx, a.postId), { position: 1 }));
      expect(code).toBe(UNIQUE_VIOLATION);
    }));

  it("das Elternteil steht in derselben Version", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const fork = await createFork(db, a.postId, a.versionId, 2);
      const parent = await createTextElement(db, a.postId);
      await link(db, a, parent);
      const code = await expectDbError(db, async (tx) =>
        link(tx, { postId: a.postId, versionId: fork }, await createTextElement(tx, a.postId), { parent }),
      );
      expect(code).toBe(FK_VIOLATION);
    }));

  it("Positionen sind je Elternteil eindeutig; fällt das Elternteil weg, fallen die Kinder mit", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const root = await createTextElement(db, a.postId);
      await link(db, a, root);
      await link(db, a, await createTextElement(db, a.postId), { parent: root, position: 0 });
      const code = await expectDbError(db, async (tx) =>
        link(tx, a, await createTextElement(tx, a.postId), { parent: root, position: 0 }),
      );
      expect(code).toBe(UNIQUE_VIOLATION);

      await db.delete(versionElements).where(eq(versionElements.elementId, root));
      expect(await db.select().from(versionElements).where(eq(versionElements.versionId, a.versionId))).toEqual([]);
    }));
});

describe("Elemente", () => {
  it("ein Element kann von mehreren Versionen geteilt werden", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const fork = await createFork(db, a.postId, a.versionId, 2);
      const element = await createTextElement(db, a.postId);
      await link(db, a, element);
      await link(db, { postId: a.postId, versionId: fork }, element);

      const [{ uses }] = await db
        .select({ uses: count() })
        .from(versionElements)
        .where(eq(versionElements.elementId, element));
      expect(uses).toBe(2);
    }));

  it("ein Element kommt pro Version höchstens einmal vor", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const root = await createTextElement(db, a.postId);
      const element = await createTextElement(db, a.postId);
      await link(db, a, root);
      await link(db, a, element, { parent: root, position: 0 });
      const code = await expectDbError(db, (tx) => link(tx, a, element, { parent: root, position: 1 }));
      expect(code).toBe(UNIQUE_VIOLATION);
    }));

  it("eine Version kann keine Elemente eines anderen Posts verlinken", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const b = await createPost(db);
      const foreign = await createTextElement(db, b.postId);
      // Aufgeschobene Regel (siehe drizzle/0008_*): für den Test sofort prüfen lassen.
      const code = await expectDbError(db, async (tx) => {
        await tx.execute(sql`SET CONSTRAINTS version_elements_element_fk IMMEDIATE`);
        await link(tx, a, foreign);
      });
      expect(code).toBe(FK_VIOLATION);
    }));

  it("ein verwendetes Element lässt sich nicht löschen", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const element = await createTextElement(db, a.postId);
      await link(db, a, element);
      // Aufgeschobene Regel (siehe drizzle/0008_*): für den Test sofort prüfen lassen.
      const code = await expectDbError(db, async (tx) => {
        await tx.execute(sql`SET CONSTRAINTS version_elements_element_fk IMMEDIATE`);
        await tx.delete(elements).where(eq(elements.id, element));
      });
      expect(code).toBe(FK_VIOLATION);
    }));

  it("Bild-Elemente brauchen ein Medium, andere dürfen keins haben", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const [medium] = await db
        .insert(media)
        .values({ folderId: await createFolder(db), storageKey: "k", filename: "f.jpg", mimeType: "image/jpeg", sizeBytes: 1, width: 1, height: 1 })
        .returning();
      expect(
        await expectDbError(db, (tx) => tx.insert(elements).values({ postId: a.postId, type: "image" })),
      ).toBe(CHECK_VIOLATION);
      expect(
        await expectDbError(db, (tx) =>
          tx.insert(elements).values({ postId: a.postId, type: "text", mediaId: medium.id }),
        ),
      ).toBe(CHECK_VIOLATION);
    }));

  it("ein verwendetes Medium lässt sich nicht löschen", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const [medium] = await db
        .insert(media)
        .values({ folderId: await createFolder(db), storageKey: "k", filename: "f.jpg", mimeType: "image/jpeg", sizeBytes: 1, width: 1, height: 1 })
        .returning();
      await db.insert(elements).values({ postId: a.postId, type: "image", mediaId: medium.id });
      const code = await expectDbError(db, (tx) => tx.delete(media).where(eq(media.id, medium.id)));
      expect(code).toBe(RESTRICT_VIOLATION);
    }));
});

describe("Löschen", () => {
  it("ein gelöschter Tag verschwindet aus allen Versionen", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const [tag] = await db.insert(tags).values({ name: "Wurzeln", slug: "wurzeln" }).returning();
      await db.insert(versionTags).values({ versionId: a.versionId, tagId: tag.id });
      await db.delete(tags).where(eq(tags.id, tag.id));
      expect(await db.select().from(versionTags)).toEqual([]);
    }));

  it("ein gelöschter Post nimmt Versionen, Elementbaum und Elemente mit – auch veröffentlicht", () =>
    withRollback(async (db) => {
      const a = await createPost(db);
      const fork = await createFork(db, a.postId, a.versionId, 2);
      const element = await createTextElement(db, a.postId);
      await link(db, a, element);
      await link(db, { postId: a.postId, versionId: fork }, element);
      await db
        .update(posts)
        .set({ publishedVersionId: a.versionId, firstPublishedAt: new Date() })
        .where(eq(posts.id, a.postId));

      await db.delete(posts).where(eq(posts.id, a.postId));

      for (const table of [versions, versionElements, elements]) {
        const [{ n }] = await db.select({ n: count() }).from(table);
        expect(n).toBe(0);
      }
    }));
});
