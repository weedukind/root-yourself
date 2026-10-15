import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { apiTokens, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashToken, type SessionUser } from "./auth";

// API-Tokens für /api/admin/… (Authorization: Bearer …). Einer pro Nutzer, ein Jahr gültig.
// Das Präfix macht Tokens in Konfigurationsdateien und Logs erkennbar.

const PREFIX = "ry_";

export type ApiTokenInfo = { createdAt: Date; expiresAt: Date; lastUsedAt: Date | null };

function inOneYear(now: Date): Date {
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return expiresAt;
}

/** Erzeugt einen Token und ersetzt dabei einen vorhandenen. Der Klartext existiert nur im Rückgabewert. */
export async function createApiToken(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ token: string; createdAt: Date; expiresAt: Date }> {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const values = { tokenHash: hashToken(token), createdAt: now, expiresAt: inOneYear(now), lastUsedAt: null };

  await db
    .insert(apiTokens)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: apiTokens.userId, set: values });
  return { token, createdAt: values.createdAt, expiresAt: values.expiresAt };
}

/** Erstellung und Ablauf des Tokens, auch wenn er schon abgelaufen ist; null ohne Token. */
export async function getApiTokenInfo(db: Db, userId: string): Promise<ApiTokenInfo | null> {
  const [info] = await db
    .select({ createdAt: apiTokens.createdAt, expiresAt: apiTokens.expiresAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
  return info ?? null;
}

/** Der Nutzer zum Token, wenn er gültig ist, sonst null. Vermerkt dabei die Nutzung. */
export async function getApiTokenUser(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  if (!token.startsWith(PREFIX)) return null;
  const [user] = await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .from(users)
    .where(and(eq(users.id, apiTokens.userId), eq(apiTokens.tokenHash, hashToken(token)), gt(apiTokens.expiresAt, now)))
    .returning({ id: users.id, email: users.email });
  return user ?? null;
}

/** Zieht den Token zurück, ohne einen neuen zu erzeugen. */
export async function deleteApiToken(db: Db, userId: string): Promise<void> {
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
}
