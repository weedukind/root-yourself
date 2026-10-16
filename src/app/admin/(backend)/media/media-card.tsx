"use client";

import { useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { Media, MediaFolder, MediaWithUsage } from "@/shared/api/media";
import type { TagRef } from "@/shared/api/tags";
import { api } from "@/app/admin/api-client";
import { InlineEdit } from "@/app/admin/inline-edit";
import { pathLabel } from "@/app/admin/media-folders";
import { ErrorText, primaryButton, secondaryButton } from "@/app/admin/ui";

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function MediaCard({
  item,
  folders,
  showFolder,
  allTags,
  selected,
  cut,
  onToggle,
  onChanged,
}: {
  item: MediaWithUsage;
  folders: MediaFolder[];
  /** Ordnerpfad anzeigen, wenn die Liste Bilder aus mehreren Ordnern zeigt. */
  showFolder: boolean;
  allTags: TagRef[];
  selected: boolean;
  /** Ausgeschnitten, wartet auf „Einfügen“ im Ordnerbaum. */
  cut: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<ApiError | null>(null);
  const inUse = item.versionCount > 0;

  return (
    <li
      className={`flex flex-col overflow-hidden rounded border bg-white ${selected ? "border-zinc-900 ring-2 ring-zinc-900" : "border-zinc-200"} ${cut ? "opacity-50" : ""}`}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-zinc-100">
        <input
          type="checkbox"
          aria-label={`${item.filename} auswählen`}
          checked={selected}
          onChange={onToggle}
          className="absolute top-2 left-2 h-5 w-5 cursor-pointer"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
        <img src={item.url} alt={item.alt} loading="lazy" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="truncate text-sm font-medium" title={item.filename}>
            {item.filename}
          </p>
          <p className="text-xs text-zinc-500">
            {item.width} × {item.height} · {formatSize(item.sizeBytes)} ·{" "}
            {inUse ? `in ${item.versionCount} ${item.versionCount === 1 ? "Version" : "Versionen"}` : "nicht verwendet"}
          </p>
          {showFolder && <p className="truncate text-xs text-zinc-500">📁 {pathLabel(folders, item.folderId)}</p>}
        </div>
        <MediaTags item={item} allTags={allTags} onChanged={onChanged} onError={setError} />
        <AltText item={item} onChanged={onChanged} onError={setError} />
        <ErrorText error={error} />
        {error?.code === "stale" && (
          <button type="button" className={`${primaryButton} self-start`} onClick={onChanged}>
            Neu laden
          </button>
        )}
      </div>
    </li>
  );
}

/** Alt-Text zum Lesen; Doppelklick (oder Enter/F2 mit Fokus) macht ein Feld daraus. Enter speichert, Escape oder Wegklicken verwirft. */
function AltText({
  item,
  onChanged,
  onError,
}: {
  item: MediaWithUsage;
  onChanged: () => Promise<void>;
  onError: (error: ApiError | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  function cancel() {
    setEditing(false);
    onError(null);
  }

  async function save(alt: string) {
    if (alt === item.alt) return setEditing(false);
    const result = await api<Media>(`/media/${item.id}`, { method: "PATCH", body: { alt, updatedAt: item.updatedAt } });
    if (!result.ok) return onError(result.error);
    onError(null);
    setEditing(false);
    await onChanged();
  }

  if (editing) {
    return (
      <InlineEdit
        label={`Alt-Text von ${item.filename}`}
        initial={item.alt}
        placeholder="Alt-Text (Bildbeschreibung)"
        onSubmit={save}
        onCancel={cancel}
      />
    );
  }

  return (
    <p
      role="button"
      tabIndex={0}
      title="Doppelklick zum Bearbeiten"
      aria-label={`Alt-Text von ${item.filename}: ${item.alt || "leer"}. Enter zum Bearbeiten`}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className="cursor-text rounded px-1 py-0.5 text-sm select-none hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
    >
      {item.alt || <span className="text-zinc-400 italic">Kein Alt-Text</span>}
    </p>
  );
}

function MediaTags({
  item,
  allTags,
  onChanged,
  onError,
}: {
  item: MediaWithUsage;
  allTags: TagRef[];
  onChanged: () => Promise<void>;
  onError: (error: ApiError | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setSelected(new Set(item.tags.map((t) => t.id)));
    setEditing(true);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    const result = await api<Media>(`/media/${item.id}`, {
      method: "PATCH",
      body: { tagIds: [...selected], updatedAt: item.updatedAt },
    });
    setBusy(false);
    if (!result.ok) return onError(result.error);
    onError(null);
    setEditing(false);
    await onChanged();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {item.tags.map((tag) => (
          <span key={tag.id} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
            {tag.name}
          </span>
        ))}
        <button type="button" className="text-xs text-zinc-500 underline hover:text-zinc-900" onClick={startEdit}>
          {item.tags.length ? "Tags ändern" : "Tags zuordnen"}
        </button>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2 rounded border border-zinc-200 p-2">
      <legend className="px-1 text-xs font-medium">Tags</legend>
      {allTags.length === 0 ? (
        <p className="text-xs text-zinc-500">Noch keine Tags angelegt.</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {allTags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggle(tag.id)} />
              {tag.name}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={primaryButton} onClick={save} disabled={busy}>
          Übernehmen
        </button>
        <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>
          Abbrechen
        </button>
      </div>
    </fieldset>
  );
}
