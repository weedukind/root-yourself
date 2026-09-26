import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { withRollback } from "../../../test/db";
import { memoryStorage } from "../../../test/memory-storage";
import { changeSlug, createPost, getPost } from "../posts/posts";
import { getVersion, saveVersion } from "../versions/content";
import { publishVersion, unpublishPost } from "../versions/versions";
import { findPublishedPost } from "./posts";

const { storage } = memoryStorage();

/** Legt einen Post mit einem Text an; optional veröffentlicht. */
async function post(db: Db, title: string, publish: boolean) {
  const created = await createPost(db, { title });
  if (!created.ok) throw new Error(created.error.message);
  const v1 = await getVersion(db, storage, created.value.id, created.value.versions[0].id);
  if (!v1.ok) throw new Error(v1.error.message);
  await saveVersion(db, storage, created.value.id, v1.value.id, {
    title,
    tagIds: [],
    rows: [{ gridWidth: 1, gridHeight: 1, cells: [{ width: 1, height: 1, elements: [{ type: "text", data: { markdown: "Hallo" } }] }] }],
    updatedAt: v1.value.updatedAt,
  });
  if (publish) await publishVersion(db, created.value.id, v1.value.id);
  const detail = await getPost(db, created.value.id);
  if (!detail.ok) throw new Error(detail.error.message);
  return detail.value;
}

describe("findPublishedPost", () => {
  it("liefert die veröffentlichte Version mit Inhalt", () =>
    withRollback(async (db) => {
      await post(db, "Wurzeln", true);
      const result = await findPublishedPost(db, storage, "wurzeln");
      expect(result).toMatchObject({ kind: "post", post: { slug: "wurzeln", title: "Wurzeln", tags: [] } });
      if (result.kind === "post") {
        expect(result.post.rows[0].cells[0].elements[0]).toMatchObject({ type: "text", data: { markdown: "Hallo" } });
        expect(result.post.firstPublishedAt).toBeTruthy();
      }
    }));

  it("unveröffentlichte und unbekannte Posts gibt es nicht", () =>
    withRollback(async (db) => {
      await post(db, "Entwurf", false);
      expect(await findPublishedPost(db, storage, "entwurf")).toEqual({ kind: "missing" });
      expect(await findPublishedPost(db, storage, "gibt-es-nicht")).toEqual({ kind: "missing" });
    }));

  it("alte Slugs leiten weiter – aber nur, solange der Post veröffentlicht ist", () =>
    withRollback(async (db) => {
      const p = await post(db, "Wurzeln", true);
      await changeSlug(db, p.id, { slug: "wurzelwerk", updatedAt: p.updatedAt });
      expect(await findPublishedPost(db, storage, "wurzeln")).toEqual({ kind: "redirect", slug: "wurzelwerk" });

      await unpublishPost(db, p.id);
      expect(await findPublishedPost(db, storage, "wurzeln")).toEqual({ kind: "missing" });
      expect(await findPublishedPost(db, storage, "wurzelwerk")).toEqual({ kind: "missing" });
    }));
});
