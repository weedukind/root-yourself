import type { ApiError } from "@/shared/api/errors";

// Gemeinsame Bausteine der Admin-Oberfläche.

export const inputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none";
const button = "rounded px-3 py-1 text-sm font-medium disabled:opacity-50";
export const primaryButton = `${button} bg-zinc-900 text-white hover:bg-zinc-700`;
export const secondaryButton = `${button} border border-zinc-300 bg-white hover:bg-zinc-100`;
export const dangerButton = `${button} bg-red-600 text-white hover:bg-red-500`;

export function ErrorText({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {error.issues?.[0]?.message ?? error.message}
    </p>
  );
}
