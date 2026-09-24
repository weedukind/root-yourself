import type { ApiError } from "@/shared/api/errors";

// Service-Funktionen geben erwartbare Fehler als Ergebnis zurück, statt zu werfen.
// Unerwartete Fehler (Datenbank nicht erreichbar, Programmierfehler) werden weiterhin geworfen.

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (error: ApiError): Result<never> => ({ ok: false, error });

export const notFound = (what: string): Result<never> =>
  fail({ kind: "not_found", code: "not_found", message: `${what} nicht gefunden` });

export const conflict = (code: string, message: string, field?: string): Result<never> =>
  fail({ kind: "conflict", code, message, field });

export const invalid = (code: string, message: string, field?: string): Result<never> =>
  fail({ kind: "invalid", code, message, field });
