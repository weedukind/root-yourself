import type { ApiError, ApiErrorBody } from "@/shared/api/errors";

// Aufruf der Admin-REST-API aus dem Browser. Basic Auth schickt der Browser selbst mit.

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const networkError: ApiError = {
  kind: "invalid",
  code: "network",
  message: "Server nicht erreichbar. Bitte erneut versuchen.",
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, error: networkError };
  }

  if (response.status === 204) return { ok: true, value: null as T };
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, value: body as T };
  return { ok: false, error: (body as ApiErrorBody | null)?.error ?? { ...networkError, message: `Fehler ${response.status}` } };
}
