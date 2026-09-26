import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { withRollback } from "../../../test/db";
import { memoryStorage } from "../../../test/memory-storage";
import { createPreviewToken } from "../preview-token";
import { changeSlug, createPost } from "../posts/posts";
import { createShareLink, findPreview } from "./preview";

const { storage } = memoryStorage();

async function post(db: Db) {
  const created = await createPost(db, { title: "Wurzeln" });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

describe("findPreview", () => {
  it("zeigt die Version mit gültigem Token", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const vid = p.versions[0].id;
      const { token, expiresAt } = createPreviewToken(vid, 7);
      const result = await findPreview(db, storage, "wurzeln", vid, token);
      expect(result).toMatchObject({ kind: "preview", version: { id: vid, title: "Wurzeln" }, expiresAt });
    }));

  it("ohne gültigen Token, mit fremdem Token oder für unbekannte Versionen: nichts", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const vid = p.versions[0].id;
      const other = createPreviewToken(crypto.randomUUID(), 7).token;
      expect(await findPreview(db, storage, "wurzeln", vid, "kaputt")).toEqual({ kind: "missing" });
      expect(await findPreview(db, storage, "wurzeln", vid, other)).toEqual({ kind: "missing" });
      expect(await findPreview(db, storage, "wurzeln", "keine-uuid", other)).toEqual({ kind: "missing" });
      const ghost = crypto.randomUUID();
      expect(await findPreview(db, storage, "wurzeln", ghost, createPreviewToken(ghost, 7).token)).toEqual({ kind: "missing" });
    }));

  it("abgelaufene Links zeigen nichts", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const vid = p.versions[0].id;
      const { token } = createPreviewToken(vid, 1, new Date("2020-01-01T00:00:00Z"));
      expect(await findPreview(db, storage, "wurzeln", vid, token)).toEqual({ kind: "missing" });
    }));

  it("nach einer Slug-Änderung leitet der Link auf die aktuelle Adresse weiter", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const vid = p.versions[0].id;
      const { token } = createPreviewToken(vid, 7);
      await changeSlug(db, p.id, { slug: "wurzelwerk", updatedAt: p.updatedAt });
      expect(await findPreview(db, storage, "wurzeln", vid, token)).toEqual({
        kind: "redirect",
        path: `/preview/wurzelwerk/${vid}/${token}`,
      });
    }));
});

describe("createShareLink", () => {
  it("erzeugt einen Link mit der gewünschten Gültigkeit", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const vid = p.versions[0].id;
      const now = new Date("2026-09-26T12:00:00Z");
      const result = await createShareLink(db, p.id, vid, 30, now);
      expect(result).toMatchObject({ ok: true, value: { expiresAt: "2026-10-26T12:00:00.000Z" } });
      if (result.ok) expect(result.value.path).toMatch(new RegExp(`^/preview/wurzeln/${vid}/[0-9a-z]+\\.[\\w-]+$`));
    }));

  it("die Version muss zum Post gehören", () =>
    withRollback(async (db) => {
      const a = await post(db);
      const b = await createPost(db, { title: "Äste" });
      if (!b.ok) return;
      expect(await createShareLink(db, a.id, b.value.versions[0].id, 7)).toMatchObject({ ok: false, error: { kind: "not_found" } });
    }));

  it("der Admin-Bereich bekommt zu jeder Version einen gültigen Vorschau-Link", () =>
    withRollback(async (db) => {
      const p = await post(db);
      const [, , slug, vid, token] = p.versions[0].previewPath.split("/");
      expect(await findPreview(db, storage, slug, vid, token)).toMatchObject({ kind: "preview" });
    }));
});
