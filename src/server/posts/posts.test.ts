import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { posts, versions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PostDetail } from "@/shared/api/posts";
import { withRollback } from "../../../test/db";
import { changeSlug, createPost, deletePost, getPost, listPosts } from "./posts";

async function create(db: Db, title: string, slug?: string): Promise<PostDetail> {
  const result = await createPost(db, { title, slug });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Veröffentlicht direkt in der Datenbank (die Service-Funktion kommt in Schritt 4b). */
async function publish(db: Db, post: PostDetail, versionId = post.versions[0].id) {
  await db
    .update(posts)
    .set({ publishedVersionId: versionId, firstPublishedAt: new Date() })
    .where(eq(posts.id, post.id));
  await db.update(versions).set({ publishedAt: new Date() }).where(eq(versions.id, versionId));
  return reload(db, post.id);
}

async function reload(db: Db, id: string): Promise<PostDetail> {
  const result = await getPost(db, id);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function rename(db: Db, post: PostDetail, slug: string) {
  return changeSlug(db, post.id, { slug, updatedAt: post.updatedAt });
}

describe("createPost", () => {
  it("legt den Post mit Version 1 an, Slug aus dem Titel", () =>
    withRollback(async (db) => {
      const post = await create(db, "Über Wurzeln");
      expect(post).toMatchObject({
        slug: "ueber-wurzeln",
        title: "Über Wurzeln",
        publishedVersion: null,
        firstPublishedAt: null,
        versionCount: 1,
        editableVersionCount: 1,
        redirectSlugs: [],
      });
      expect(post.versions).toEqual([
        expect.objectContaining({ number: 1, parentVersionId: null, isLeaf: true, isPublished: false, isEditable: true }),
      ]);
    }));

  it("übernimmt einen angegebenen Slug und prüft ihn", () =>
    withRollback(async (db) => {
      expect((await create(db, "Titel", "eigener-slug")).slug).toBe("eigener-slug");
      expect(await createPost(db, { title: "Titel", slug: "Kein Slug" })).toMatchObject({
        ok: false,
        error: { code: "slug_invalid" },
      });
      expect(await createPost(db, { title: "!!!" })).toMatchObject({ ok: false, error: { code: "slug_empty" } });
    }));

  it("lehnt vergebene Slugs ab", () =>
    withRollback(async (db) => {
      await create(db, "Wurzeln");
      expect(await createPost(db, { title: "Wurzeln" })).toMatchObject({ ok: false, error: { code: "slug_taken" } });
    }));

  it("übernimmt den alten Slug eines anderen Posts und beendet dessen Weiterleitung", () =>
    withRollback(async (db) => {
      const old = await publish(db, await create(db, "Wurzeln"));
      await rename(db, old, "wurzelwerk");
      const taker = await create(db, "Wurzeln");
      expect(taker.slug).toBe("wurzeln");
      expect((await reload(db, old.id)).redirectSlugs).toEqual([]);
    }));
});

describe("changeSlug", () => {
  it("ändert den Slug eines nie veröffentlichten Posts ohne Weiterleitung", () =>
    withRollback(async (db) => {
      const post = await create(db, "Wurzeln");
      const result = await rename(db, post, "wurzelwerk");
      expect(result).toMatchObject({ ok: true, value: { slug: "wurzelwerk", redirectSlugs: [] } });
    }));

  it("leitet frühere Slugs veröffentlichter Posts weiter, ohne Ketten", () =>
    withRollback(async (db) => {
      let post = await publish(db, await create(db, "Wurzeln"));
      for (const slug of ["wurzelwerk", "wurzeln-und-aeste"]) {
        const result = await rename(db, post, slug);
        if (!result.ok) throw new Error(result.error.message);
        post = result.value;
      }
      expect(post.slug).toBe("wurzeln-und-aeste");
      // Beide alten Slugs zeigen direkt auf den Post.
      expect([...post.redirectSlugs].sort()).toEqual(["wurzeln", "wurzelwerk"]);
    }));

  it("zurück zu einem alten Slug hebt dessen Weiterleitung auf", () =>
    withRollback(async (db) => {
      const post = await publish(db, await create(db, "Wurzeln"));
      const renamed = await rename(db, post, "wurzelwerk");
      if (!renamed.ok) throw new Error(renamed.error.message);
      const back = await rename(db, renamed.value, "wurzeln");
      expect(back).toMatchObject({ ok: true, value: { slug: "wurzeln", redirectSlugs: ["wurzelwerk"] } });
    }));

  it("lehnt den Slug eines anderen Posts ab", () =>
    withRollback(async (db) => {
      await create(db, "Wurzeln");
      const other = await create(db, "Äste");
      expect(await rename(db, other, "wurzeln")).toMatchObject({ ok: false, error: { code: "slug_taken" } });
    }));

  it("übernimmt den alten Slug eines anderen Posts", () =>
    withRollback(async (db) => {
      const first = await publish(db, await create(db, "Wurzeln"));
      await rename(db, first, "wurzelwerk");
      const second = await create(db, "Äste");
      expect(await rename(db, second, "wurzeln")).toMatchObject({ ok: true, value: { slug: "wurzeln" } });
      expect((await reload(db, first.id)).redirectSlugs).toEqual([]);
    }));

  it("verhindert das Überschreiben einer zwischenzeitlichen Änderung", () =>
    withRollback(async (db) => {
      const post = await create(db, "Wurzeln");
      expect((await rename(db, post, "a")).ok).toBe(true);
      expect(await rename(db, post, "b")).toMatchObject({ ok: false, error: { code: "stale" } });
    }));

  it("meldet ungültige Slugs und unbekannte Posts", () =>
    withRollback(async (db) => {
      const post = await create(db, "Wurzeln");
      expect(await rename(db, post, "Ungültig!")).toMatchObject({ ok: false, error: { code: "slug_invalid" } });
      expect(
        await changeSlug(db, crypto.randomUUID(), { slug: "x", updatedAt: new Date().toISOString() }),
      ).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));
});

describe("listPosts", () => {
  it("zeigt Titel und Status, zuletzt geänderte zuerst", () =>
    withRollback(async (db) => {
      const first = await create(db, "Erster");
      const second = await create(db, "Zweiter");
      // Erster bekommt eine zweite Version (Entwurf) und wird mit Version 1 veröffentlicht.
      await db.insert(versions).values({ postId: first.id, number: 2, parentVersionId: first.versions[0].id, title: "Erster, überarbeitet" });
      await publish(db, first);
      // Innerhalb der Test-Transaktion haben alle Zeitstempel denselben Wert; Zweiter älter machen.
      await db
        .update(versions)
        .set({ updatedAt: new Date("2020-01-01T00:00:00Z") })
        .where(eq(versions.postId, second.id));
      await db.update(posts).set({ updatedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(posts.id, second.id));

      const list = await listPosts(db);
      expect(list.map((p) => p.id)).toEqual([first.id, second.id]);
      expect(list[0]).toMatchObject({
        title: "Erster", // Titel der veröffentlichten Version
        publishedVersion: { number: 1 },
        versionCount: 2,
        editableVersionCount: 1, // Version 1 ist veröffentlicht und innerer Knoten, Version 2 bearbeitbar
      });
      expect(list[1]).toMatchObject({ title: "Zweiter", publishedVersion: null });
    }));
});

describe("deletePost", () => {
  it("löscht auch veröffentlichte Posts samt Weiterleitungen", () =>
    withRollback(async (db) => {
      const post = await publish(db, await create(db, "Wurzeln"));
      await rename(db, post, "wurzelwerk");
      expect(await deletePost(db, post.id)).toEqual({ ok: true, value: null });
      expect(await getPost(db, post.id)).toMatchObject({ ok: false, error: { kind: "not_found" } });
      // Der alte Slug ist wieder frei.
      expect((await create(db, "Wurzeln")).slug).toBe("wurzeln");
    }));
});
