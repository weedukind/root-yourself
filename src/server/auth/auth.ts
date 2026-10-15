import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lte, ne } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { invalid, ok, type Result } from "../result";

// Anmeldung gegen die Tabelle users, Sessions in der Tabelle sessions.
// Das Cookie trägt einen Zufallstoken, die Datenbank nur dessen Hash (siehe schema.ts).

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Auch in scripts/hash-password.mjs.
export const PASSWORD_MIN_LENGTH = 10;

// Für unbekannte E-Mails wird gegen diesen Hash verglichen, damit die Antwortzeit nicht verrät,
// ob es die Adresse gibt. Fest hinterlegt, weil hashSync jeden Kaltstart verzögern würde.
const DUMMY_HASH = "$2b$12$TVFvq/ryWDCD1iIgYrNzvuBz4866ov7PAV8WDXmptWKzl2jgmlPvy";

export type SessionUser = { id: string; email: string };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

/** Der Nutzer, wenn E-Mail und Passwort stimmen, sonst null. */
export async function authenticate(db: Db, email: string, password: string): Promise<SessionUser | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && valid ? { id: user.id, email: user.email } : null;
}

/** Legt eine Session an und räumt dabei abgelaufene Sessions auf. */
export async function createSession(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);

  await db.delete(sessions).where(lte(sessions.expiresAt, now));
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** Der angemeldete Nutzer, wenn der Token zu einer gültigen Session gehört, sonst null. */
export async function getSessionUser(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)));
  return user ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/**
 * Ändert das Passwort, wenn das aktuelle stimmt. Alle anderen Sessions des Nutzers enden,
 * die aktuelle (currentToken) bleibt bestehen.
 */
export async function changePassword(
  db: Db,
  userId: string,
  input: { currentPassword: string; newPassword: string },
  currentToken: string,
): Promise<Result<void>> {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    return invalid("wrong_password", "Das aktuelle Passwort ist falsch.", "currentPassword");
  }
  if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
    return invalid(
      "password_too_short",
      `Das neue Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben.`,
      "newPassword",
    );
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(input.newPassword, 12), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(currentToken))));
  return ok(undefined);
}
