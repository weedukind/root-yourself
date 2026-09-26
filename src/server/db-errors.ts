// Erkennt Verletzungen von Datenbankregeln. Drizzle verpackt den Treiberfehler in `cause`.

type PgError = { code?: string; constraint?: string };

function pgError(error: unknown): PgError | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  return (typeof cause === "object" && cause !== null ? cause : error) as PgError;
}

/** Name der verletzten UNIQUE-Regel, sonst undefined. */
export function uniqueViolation(error: unknown): string | undefined {
  const pg = pgError(error);
  return pg?.code === "23505" ? pg.constraint : undefined;
}

/** true, wenn ein Löschen an ON DELETE RESTRICT gescheitert ist. */
export function restrictViolation(error: unknown): boolean {
  return pgError(error)?.code === "23001";
}

/** true, wenn ein Verweis auf einen nicht vorhandenen Datensatz zeigt. */
export function foreignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === "23503";
}
