import { describe, expect, it } from "vitest";
import { apiTokens, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { withRollback } from "../../../test/db";
import { createApiToken, deleteApiToken, getApiTokenInfo, getApiTokenUser } from "./api-tokens";

async function createUser(db: Db, email = "autorin@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "unbenutzt" })
    .returning({ id: users.id, email: users.email });
  return user;
}

describe("API-Tokens", () => {
  it("gilt ein Jahr und gehört zum Nutzer", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const now = new Date("2026-10-15T12:00:00Z");
      const { token, expiresAt } = await createApiToken(db, user.id, now);

      expect(token).toMatch(/^ry_[\w-]{43}$/);
      expect(expiresAt).toEqual(new Date("2027-10-15T12:00:00Z"));
      expect(await getApiTokenInfo(db, user.id)).toEqual({ createdAt: now, expiresAt, lastUsedAt: null });
      expect(await getApiTokenUser(db, token, now)).toEqual(user);
      expect(await getApiTokenUser(db, token, expiresAt)).toBeNull();
    }));

  it("speichert nur den Hash", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createApiToken(db, user.id);
      const [stored] = await db.select().from(apiTokens);
      expect(stored.tokenHash).not.toContain(token.slice(3));
    }));

  it("ein neuer Token ersetzt den alten", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const first = await createApiToken(db, user.id);
      const second = await createApiToken(db, user.id);

      expect(await getApiTokenUser(db, first.token)).toBeNull();
      expect(await getApiTokenUser(db, second.token)).toEqual(user);
      expect(await db.select().from(apiTokens)).toHaveLength(1);
    }));

  it("Tokens verschiedener Nutzer sind unabhängig", () =>
    withRollback(async (db) => {
      const a = await createUser(db, "a@example.com");
      const b = await createUser(db, "b@example.com");
      const tokenA = await createApiToken(db, a.id);
      await createApiToken(db, b.id);
      expect(await getApiTokenUser(db, tokenA.token)).toEqual(a);
    }));

  it("lehnt Unbekanntes ab, auch Session-Tokens ohne Präfix", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      expect(await getApiTokenInfo(db, user.id)).toBeNull();
      expect(await getApiTokenUser(db, "ry_unbekannt")).toBeNull();
      expect(await getApiTokenUser(db, "kein-praefix")).toBeNull();
    }));

  it("vermerkt die letzte Nutzung; ein neuer Token beginnt ohne", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createApiToken(db, user.id);
      const used = new Date(Date.now() + 1000);
      await getApiTokenUser(db, token, used);
      expect((await getApiTokenInfo(db, user.id))?.lastUsedAt).toEqual(used);

      await getApiTokenUser(db, "ry_falsch", new Date(Date.now() + 2000));
      expect((await getApiTokenInfo(db, user.id))?.lastUsedAt).toEqual(used);

      await createApiToken(db, user.id);
      expect((await getApiTokenInfo(db, user.id))?.lastUsedAt).toBeNull();
    }));

  it("ein abgelaufener Token zählt nicht als benutzt", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token, expiresAt } = await createApiToken(db, user.id);
      expect(await getApiTokenUser(db, token, expiresAt)).toBeNull();
      expect((await getApiTokenInfo(db, user.id))?.lastUsedAt).toBeNull();
    }));

  it("Löschen zieht den Token zurück", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createApiToken(db, user.id);
      await deleteApiToken(db, user.id);
      expect(await getApiTokenUser(db, token)).toBeNull();
      expect(await getApiTokenInfo(db, user.id)).toBeNull();
    }));
});
