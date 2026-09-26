import { createHmac, timingSafeEqual } from "node:crypto";

// Signierte Vorschau-Links: /preview/<slug>/<version-id>/<token>
// Token = <ablauf, Sekunden seit 1970, Basis 36>.<HMAC-SHA256 über Versions-ID und Ablauf>
// Gilt nur für diese eine Version und nur bis zum Ablauf. Einen neuen PREVIEW_SECRET setzen
// macht alle ausgegebenen Links ungültig.

const DAY = 24 * 60 * 60;

function secret(): string {
  const value = process.env.PREVIEW_SECRET;
  if (!value) throw new Error("PREVIEW_SECRET ist nicht gesetzt");
  return value;
}

const sign = (versionId: string, expires: number) =>
  createHmac("sha256", secret()).update(`${versionId}.${expires}`).digest("base64url");

export function createPreviewToken(versionId: string, days: number, now = new Date()): { token: string; expiresAt: Date } {
  const expires = Math.floor(now.getTime() / 1000) + Math.round(days * DAY);
  return { token: `${expires.toString(36)}.${sign(versionId, expires)}`, expiresAt: new Date(expires * 1000) };
}

/** Ablaufzeitpunkt, wenn der Token für diese Version gültig ist, sonst null. */
export function verifyPreviewToken(versionId: string, token: string, now = new Date()): Date | null {
  const [encodedExpiry, signature, ...rest] = token.split(".");
  if (!encodedExpiry || !signature || rest.length > 0) return null;
  const expires = parseInt(encodedExpiry, 36);
  if (!Number.isSafeInteger(expires) || expires * 1000 <= now.getTime()) return null;

  const expected = Buffer.from(sign(versionId, expires));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? new Date(expires * 1000) : null;
}

export function previewPath(slug: string, versionId: string, token: string): string {
  return `/preview/${slug}/${versionId}/${token}`;
}
