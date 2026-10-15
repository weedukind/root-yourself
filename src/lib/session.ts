import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db";
import { createSession, deleteSession, getSessionUser, SESSION_COOKIE, type SessionUser } from "@/server/auth/auth";
import { addKnownEmail, KNOWN_EMAILS_COOKIE, parseKnownEmails } from "./known-emails";

// Session-Cookie für Server Components und Server Actions. proxy.ts liest es direkt aus dem Request.

// Safari speichert Secure-Cookies unter http://localhost nicht.
const secure = process.env.NODE_ENV === "production";
const YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(db, token);
  store.delete(SESSION_COOKIE);
}

/** Der Token der aktuellen Session, z. B. um sie beim Passwortwechsel zu behalten. */
export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  return token ? getSessionUser(db, token) : null;
}

export async function getKnownEmails(): Promise<string[]> {
  return parseKnownEmails((await cookies()).get(KNOWN_EMAILS_COOKIE)?.value);
}

/** Merkt sich die E-Mail für die nächste Anmeldung in diesem Browser. */
export async function rememberEmail(email: string): Promise<void> {
  const emails = addKnownEmail(await getKnownEmails(), email);
  (await cookies()).set(KNOWN_EMAILS_COOKIE, JSON.stringify(emails), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/admin",
    maxAge: YEAR_SECONDS,
  });
}

export async function forgetKnownEmails(): Promise<void> {
  (await cookies()).delete({ name: KNOWN_EMAILS_COOKIE, path: "/admin" });
}
