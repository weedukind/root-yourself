import { z } from "zod";

// E-Mails, mit denen sich jemand in diesem Browser erfolgreich angemeldet hat, als Vorschläge
// für die Login-Seite. Liegen im Cookie known_emails, zuletzt benutzte zuerst.

export const KNOWN_EMAILS_COOKIE = "known_emails";
export const MAX_KNOWN_EMAILS = 5;

const schema = z.array(z.email()).max(MAX_KNOWN_EMAILS);

/** Liest den Cookie-Wert; Unbrauchbares ergibt eine leere Liste. */
export function parseKnownEmails(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Stellt die E-Mail an den Anfang, ohne Dubletten, höchstens MAX_KNOWN_EMAILS. */
export function addKnownEmail(emails: string[], email: string): string[] {
  return [email, ...emails.filter((known) => known !== email)].slice(0, MAX_KNOWN_EMAILS);
}
