import type { z } from "zod";
import type { ApiError, ApiErrorBody, ErrorKind } from "@/shared/api/errors";
import { fail, ok, type Result } from "./result";

// Übersetzt Service-Ergebnisse in HTTP-Antworten für die Route Handlers.

const STATUS: Record<ErrorKind, number> = { invalid: 400, not_found: 404, conflict: 409 };

export function errorResponse(error: ApiError): Response {
  return Response.json({ error } satisfies ApiErrorBody, { status: STATUS[error.kind] });
}

export function toResponse<T>(result: Result<T>, status = 200): Response {
  if (!result.ok) return errorResponse(result.error);
  if (status === 204) return new Response(null, { status });
  return Response.json(result.value, { status });
}

export function validate<S extends z.ZodType>(schema: S, input: unknown): Result<z.infer<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);

  const issues = parsed.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  return fail({
    kind: "invalid",
    code: "validation_failed",
    message: "Eingabe ungültig",
    field: issues[0]?.field || undefined,
    issues,
  });
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<Result<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ kind: "invalid", code: "invalid_json", message: "Anfrage enthält kein gültiges JSON" });
  }
  return validate(schema, body);
}
