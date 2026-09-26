import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { media, posts, tags } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ElementInput, SaveVersionInput } from "@/shared/api/versions";
import { withRollback } from "../../../test/db";
import { memoryStorage } from "../../../test/memory-storage";
import { createPost } from "../posts/posts";
import { getVersion, saveVersion } from "../versions/content";
import { forkVersion, publishVersion } from "../versions/versions";
import { decodeCursor, encodeCursor, listTeasers } from "./feed";

const { storage } = memoryStorage();

const text = (markdown: string): ElementInput => ({ type: "text", data: { markdown } });
const oneCell = (elements: ElementInput[]): SaveVersionInput["rows"] => [
  { gridWidth: 1, gridHeight: 1, cells: [{ width: 1, height: 1, elements }] },
];

/** Legt einen Post mit Inhalt an, veröffentlicht ihn und setzt das Veröffentlichungsdatum. */
async function published(
  db: Db,
  title: string,
  day: number,
  content: { rows?: SaveVersionInput["rows"]; tagIds?: string[]; publish?: boolean } = {},
) {
  const created = await createPost(db, { title });
  if (!created.ok) throw new Error(created.error.message);
  const postId = created.value.id;
  const v1 = await getVersion(db, storage, postId, created.value.versions[0].id);
  if (!v1.ok) throw new Error(v1.error.message);
  const saved = await saveVersion(db, storage, postId, v1.value.id, {
    title,
    tagIds: content.tagIds ?? [],
    rows: content.rows ?? oneCell([text(`Text von ${title}`)]),
    updatedAt: v1.value.updatedAt,
  });
  if (!saved.ok) throw new Error(saved.error.message);
  if (content.publish !== false) {
    await publishVersion(db, postId, v1.value.id);
    await db.update(posts).set({ firstPublishedAt: new Date(Date.UTC(2026, 0, day)) }).where(eq(posts.id, postId));
  }
  return { postId, versionId: v1.value.id };
}

const slugs = (page: { teasers: { slug: string }[] }) => page.teasers.map((t) => t.slug);

describe("listTeasers", () => {
  it("zeigt veröffentlichte Posts, zuerst veröffentlichte oben", () =>
    withRollback(async (db) => {
      await published(db, "Alt", 1);
      await published(db, "Neu", 3);
      await published(db, "Mitte", 2);
      await published(db, "Entwurf", 4, { publish: false });
      expect(slugs(await listTeasers(db, storage))).toEqual(["neu", "mitte", "alt"]);
    }));

  it("blättert ohne Duplikate und Lücken – auch wenn zwischendurch ein neuer Post erscheint", () =>
    withRollback(async (db) => {
      for (let day = 1; day <= 12; day++) await published(db, `Post ${day}`, day);

      const first = await listTeasers(db, storage);
      expect(slugs(first)).toEqual(Array.from({ length: 10 }, (_, i) => `post-${12 - i}`));
      expect(first.nextCursor).not.toBeNull();

      await published(db, "Ganz neu", 20);
      const second = await listTeasers(db, storage, { after: decodeCursor(first.nextCursor!)! });
      expect(slugs(second)).toEqual(["post-2", "post-1"]);
      expect(second.nextCursor).toBeNull();
    }));

  it("gleiches Veröffentlichungsdatum: die ID entscheidet, der Cursor funktioniert trotzdem", () =>
    withRollback(async (db) => {
      for (const title of ["A", "B", "C"]) await published(db, title, 5);
      const first = await listTeasers(db, storage, { limit: 2 });
      const second = await listTeasers(db, storage, { limit: 2, after: decodeCursor(first.nextCursor!)! });
      expect([...slugs(first), ...slugs(second)].sort()).toEqual(["a", "b", "c"]);
      expect(second.nextCursor).toBeNull();
    }));

  it("Anreißer aus dem ersten nicht leeren Text, Bild aus dem ersten Bild – in Lesereihenfolge", () =>
    withRollback(async (db) => {
      const [image] = await db
        .insert(media)
        .values({ storageKey: "2026/01/a.jpg", filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1, width: 800, height: 600, alt: "Wald" })
        .returning();
      await published(db, "Layout", 1, {
        rows: [
          {
            gridWidth: 2,
            gridHeight: 1,
            cells: [
              { width: 1, height: 1, elements: [{ type: "heading", data: { level: 2, text: "Titel" } }, text("   ")] },
              { width: 1, height: 1, elements: [{ type: "image", data: {}, mediaId: image.id }, text("Erster **echter** Text.")] },
            ],
          },
          { gridWidth: 1, gridHeight: 1, cells: [{ width: 1, height: 1, elements: [text("Späterer Text.")] }] },
        ],
      });
      const [teaser] = (await listTeasers(db, storage)).teasers;
      expect(teaser.excerpt).toBe("Erster echter Text.");
      expect(teaser.image).toEqual({ id: image.id, url: "https://media.example/2026/01/a.jpg", width: 800, height: 600, alt: "Wald" });
    }));

  it("ohne Text und Bild: kein Anreißer, kein Bild", () =>
    withRollback(async (db) => {
      await published(db, "Leer", 1, { rows: [] });
      expect((await listTeasers(db, storage)).teasers[0]).toMatchObject({ excerpt: null, image: null });
    }));

  it("zeigt den Inhalt der veröffentlichten Version, nicht eines neueren Entwurfs", () =>
    withRollback(async (db) => {
      const { postId, versionId } = await published(db, "Wurzeln", 1);
      const fork = await forkVersion(db, postId, versionId);
      if (!fork.ok) throw new Error(fork.error.message);
      const draft = await getVersion(db, storage, postId, fork.value.id);
      if (!draft.ok) throw new Error(draft.error.message);
      await saveVersion(db, storage, postId, fork.value.id, {
        title: "Entwurfstitel",
        tagIds: [],
        rows: oneCell([text("Entwurfstext")]),
        updatedAt: draft.value.updatedAt,
      });
      expect((await listTeasers(db, storage)).teasers[0]).toMatchObject({ title: "Wurzeln", excerpt: "Text von Wurzeln" });
    }));

  it("filtert nach Tag und liefert die Tags deutsch sortiert", () =>
    withRollback(async (db) => {
      const [wurzeln, aeste] = await db
        .insert(tags)
        .values([
          { name: "Wurzeln", slug: "wurzeln" },
          { name: "Äste", slug: "aeste" },
        ])
        .returning();
      await published(db, "Mit Tags", 2, { tagIds: [wurzeln.id, aeste.id] });
      await published(db, "Ohne Tags", 1);

      const all = await listTeasers(db, storage);
      expect(all.teasers[0].tags.map((t) => t.name)).toEqual(["Äste", "Wurzeln"]);
      expect(slugs(await listTeasers(db, storage, { tagId: wurzeln.id }))).toEqual(["mit-tags"]);
    }));
});

describe("Cursor", () => {
  it("überlebt den Weg durch die URL", () => {
    const cursor = { publishedAt: new Date("2026-01-05T10:00:00.123Z"), id: crypto.randomUUID() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("ungültige Cursor ergeben null", () => {
    for (const value of ["", "kaputt", Buffer.from('["kein-datum","x"]').toString("base64url"), Buffer.from("{}").toString("base64url")]) {
      expect(decodeCursor(value)).toBeNull();
    }
  });
});
