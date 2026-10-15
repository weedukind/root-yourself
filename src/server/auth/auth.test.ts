import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { expectDbError, withRollback } from "../../../test/db";
import { authenticate, changePassword, createSession, deleteSession, getSessionUser, SESSION_DAYS } from "./auth";

const DAY_MS = 24 * 60 * 60 * 1000;

async function createUser(db: Db, email = "autorin@example.com", password = "richtig-langes-passwort") {
  // Kosten 4 statt 12: hält die Tests schnell, bcrypt.compare liest die Kosten aus dem Hash.
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await bcrypt.hash(password, 4) })
    .returning({ id: users.id, email: users.email });
  return user;
}

describe("authenticate", () => {
  it("gibt den Nutzer bei richtigem Passwort zurück, E-Mail ohne Rücksicht auf Schreibweise", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      expect(await authenticate(db, " Autorin@Example.com ", "richtig-langes-passwort")).toEqual(user);
    }));

  it("lehnt falsches Passwort und unbekannte E-Mail ab", () =>
    withRollback(async (db) => {
      await createUser(db);
      expect(await authenticate(db, "autorin@example.com", "falsch")).toBeNull();
      expect(await authenticate(db, "niemand@example.com", "richtig-langes-passwort")).toBeNull();
    }));

  it("die Datenbank nimmt nur kleingeschriebene E-Mails an", () =>
    withRollback(async (db) => {
      expect(await expectDbError(db, (tx) => createUser(tx, "Autorin@example.com"))).toBe("23514");
    }));
});

describe("Sessions", () => {
  it("findet den Nutzer zum Token, solange die Session gilt", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const now = new Date("2026-10-15T12:00:00Z");
      const { token, expiresAt } = await createSession(db, user.id, now);

      expect(expiresAt).toEqual(new Date(now.getTime() + SESSION_DAYS * DAY_MS));
      expect(await getSessionUser(db, token, now)).toEqual(user);
      expect(await getSessionUser(db, token, expiresAt)).toBeNull();
      expect(await getSessionUser(db, "unbekannt", now)).toBeNull();
    }));

  it("speichert nur den Hash des Tokens", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createSession(db, user.id);
      const [stored] = await db.select().from(sessions);
      expect(stored.tokenHash).not.toBe(token);
    }));

  it("Abmelden beendet nur die eigene Session", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const first = await createSession(db, user.id);
      const second = await createSession(db, user.id);

      await deleteSession(db, first.token);
      expect(await getSessionUser(db, first.token)).toBeNull();
      expect(await getSessionUser(db, second.token)).toEqual(user);
    }));

  it("räumt beim Anmelden abgelaufene Sessions auf", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const old = new Date("2026-01-01T00:00:00Z");
      await createSession(db, user.id, old);
      await createSession(db, user.id, new Date(old.getTime() + (SESSION_DAYS + 1) * DAY_MS));
      expect(await db.select().from(sessions)).toHaveLength(1);
    }));

  it("Löschen des Nutzers löscht seine Sessions", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createSession(db, user.id);
      await db.delete(users);
      expect(await getSessionUser(db, token)).toBeNull();
      expect(await db.select().from(sessions)).toHaveLength(0);
    }));
});

describe("changePassword", () => {
  it("setzt das neue Passwort und beendet die anderen Sessions", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const current = await createSession(db, user.id);
      const other = await createSession(db, user.id);

      const result = await changePassword(
        db,
        user.id,
        { currentPassword: "richtig-langes-passwort", newPassword: "ganz-neues-passwort" },
        current.token,
      );
      expect(result.ok).toBe(true);
      expect(await authenticate(db, user.email, "richtig-langes-passwort")).toBeNull();
      expect(await authenticate(db, user.email, "ganz-neues-passwort")).toEqual(user);
      expect(await getSessionUser(db, current.token)).toEqual(user);
      expect(await getSessionUser(db, other.token)).toBeNull();
    }));

  it("verlangt das richtige aktuelle Passwort und ein ausreichend langes neues", () =>
    withRollback(async (db) => {
      const user = await createUser(db);
      const { token } = await createSession(db, user.id);

      const wrong = await changePassword(db, user.id, { currentPassword: "falsch", newPassword: "ganz-neues-passwort" }, token);
      expect(wrong).toMatchObject({ ok: false, error: { code: "wrong_password", field: "currentPassword" } });

      const short = await changePassword(db, user.id, { currentPassword: "richtig-langes-passwort", newPassword: "kurz" }, token);
      expect(short).toMatchObject({ ok: false, error: { code: "password_too_short", field: "newPassword" } });

      expect(await authenticate(db, user.email, "richtig-langes-passwort")).toEqual(user);
    }));
});
