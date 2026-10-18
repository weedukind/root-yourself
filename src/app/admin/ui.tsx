import type { ApiError } from "@/shared/api/errors";

// Gemeinsame Bausteine der Admin-Oberfläche.

export const inputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none";
const button = "rounded px-3 py-1 text-sm font-medium disabled:opacity-50";
export const primaryButton = `${button} bg-zinc-900 text-white hover:bg-zinc-700`;
export const secondaryButton = `${button} border border-zinc-300 bg-white hover:bg-zinc-100`;
export const dangerButton = `${button} bg-red-600 text-white hover:bg-red-500`;
export const smallButton = `${secondaryButton} px-2 py-0.5 text-xs`;
const iconButtonBase = "rounded border disabled:opacity-40";
const iconButtonColors = "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:hover:bg-white";
export const iconButton = `${iconButtonBase} p-1.5 ${iconButtonColors}`;
export const primaryIconButton = `${iconButtonBase} p-1.5 border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700 disabled:hover:bg-zinc-900`;
/** Rahmen um eine Eigenschaft im Edit-Modus: Bezeichnung und Feld (bzw. die Kinder eines Containers). */
export const propertyFrame = "space-y-2 rounded border border-zinc-300 bg-white p-3";
/** Kleiner Icon-Knopf, z. B. im Rahmen eines Elements (mit <Icon small />). */
export const smallIconButton = `${iconButtonBase} p-1 ${iconButtonColors}`;

export function ErrorText({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {error.issues?.[0]?.message ?? error.message}
    </p>
  );
}

/** Link auf die öffentliche Seite eines Posts, in einem neuen Fenster. */
export function PublicPostLink({ slug, children = "Auf der Website ansehen" }: { slug: string; children?: React.ReactNode }) {
  return (
    <a href={`/posts/${slug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-700 underline hover:text-zinc-900">
      {children} ↗<span className="sr-only"> (öffnet in neuem Fenster)</span>
    </a>
  );
}

/** Vorschau einer Version im Rahmen der Website, in einem neuen Fenster (signierter Link). */
export function PreviewLink({ path }: { path: string }) {
  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-zinc-700 underline hover:text-zinc-900"
    >
      Vorschau ↗<span className="sr-only"> (öffnet in neuem Fenster)</span>
    </a>
  );
}

export { formatDateTime } from "@/lib/format";

export function Badge({ tone, children }: { tone: "green" | "amber" | "zinc"; children: React.ReactNode }) {
  const colors = {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    zinc: "bg-zinc-100 text-zinc-700",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[tone]}`}>{children}</span>;
}
