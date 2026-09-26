"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type ImageType,
  type Media,
  type MediaWithUsage,
  type PreparedUpload,
} from "@/shared/api/media";
import type { TagRef, TagWithUsage } from "@/shared/api/tags";
import { api, type ApiResult } from "@/app/admin/api-client";
import { dangerButton, ErrorText, inputClass, primaryButton, secondaryButton } from "@/app/admin/ui";

const ACCEPT = Object.keys(IMAGE_TYPES).join(",");

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const clientError = (message: string): ApiError => ({ kind: "invalid", code: "client", message });

/** Breite und Höhe ermittelt der Browser beim Dekodieren; der Server bekommt nur die Zahlen. */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error("Die Datei lässt sich nicht als Bild lesen"));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

/** Upload in drei Schritten: vorbereiten → Datei direkt in den Speicher → bestätigen. */
async function uploadFile(file: File): Promise<ApiResult<Media>> {
  if (!(file.type in IMAGE_TYPES)) return { ok: false, error: clientError("Nur JPEG, PNG, WebP, AVIF oder GIF") };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: clientError("Höchstens 20 MB") };

  let size: { width: number; height: number };
  try {
    size = await imageSize(file);
  } catch (error) {
    return { ok: false, error: clientError((error as Error).message) };
  }

  const prepared = await api<PreparedUpload>("/media/uploads", {
    method: "POST",
    body: { filename: file.name, mimeType: file.type as ImageType, size: file.size },
  });
  if (!prepared.ok) return prepared;

  try {
    const put = await fetch(prepared.value.uploadUrl, { method: "PUT", headers: prepared.value.headers, body: file });
    if (!put.ok) return { ok: false, error: clientError(`Upload abgelehnt (${put.status})`) };
  } catch {
    return { ok: false, error: clientError("Speicher nicht erreichbar") };
  }

  return api<Media>("/media", {
    method: "POST",
    body: { key: prepared.value.key, filename: file.name, ...size },
  });
}

export function MediaLibrary() {
  const [items, setItems] = useState<MediaWithUsage[] | null>(null);
  const [allTags, setAllTags] = useState<TagWithUsage[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const [mediaResult, tagsResult] = await Promise.all([
      api<MediaWithUsage[]>(filterTag ? `/media?tag=${filterTag}` : "/media"),
      api<TagWithUsage[]>("/tags"),
    ]);
    if (tagsResult.ok) setAllTags(tagsResult.value);
    if (mediaResult.ok) {
      setItems(mediaResult.value);
      setLoadError(null);
    } else {
      setLoadError(mediaResult.error);
    }
  }, [filterTag]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Liste laden, auch nach Filterwechsel
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Uploader onUploaded={load} />
      <div className="flex items-center gap-2">
        <label htmlFor="filter-tag" className="text-sm font-medium">
          Filter
        </label>
        <select
          id="filter-tag"
          className={inputClass}
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="">Alle Bilder</option>
          {allTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name} ({tag.mediaCount})
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={loadError} />
      {items === null ? (
        !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">{filterTag ? "Keine Bilder mit diesem Tag." : "Noch keine Bilder."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} allTags={allTags} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

type UploadStatus = { name: string; state: "läuft" | "fertig" | "fehler"; error?: ApiError };

function Uploader({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const busy = statuses.some((s) => s.state === "läuft");

  async function upload(files: File[]) {
    setStatuses(files.map((f) => ({ name: f.name, state: "läuft" })));
    await Promise.all(
      files.map(async (file, index) => {
        const result = await uploadFile(file);
        setStatuses((current) =>
          current.map((s, i) =>
            i === index ? { ...s, state: result.ok ? "fertig" : "fehler", error: result.ok ? undefined : result.error } : s,
          ),
        );
      }),
    );
    await onUploaded();
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="upload">
        Bilder hochladen
      </label>
      <input
        id="upload"
        type="file"
        accept={ACCEPT}
        multiple
        disabled={busy}
        className="block text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-white"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <p className="text-xs text-zinc-500">JPEG, PNG, WebP, AVIF oder GIF, höchstens 20 MB pro Bild.</p>
      {statuses.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {statuses.map((s, i) => (
            <li key={i} className={s.state === "fehler" ? "text-red-600" : "text-zinc-600"}>
              {s.name}: {s.state === "fehler" ? (s.error?.message ?? "Fehler") : s.state}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaCard({
  item,
  allTags,
  onChanged,
}: {
  item: MediaWithUsage;
  allTags: TagRef[];
  onChanged: () => Promise<void>;
}) {
  const [alt, setAlt] = useState(item.alt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const inUse = item.versionCount > 0;

  async function saveAlt(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<Media>(`/media/${item.id}`, { method: "PATCH", body: { alt, updatedAt: item.updatedAt } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    await onChanged();
  }

  async function remove() {
    setBusy(true);
    const result = await api<null>(`/media/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    await onChanged();
  }

  return (
    <li className="flex flex-col overflow-hidden rounded border border-zinc-200 bg-white">
      <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100">
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
        </div>
        <MediaTags item={item} allTags={allTags} onChanged={onChanged} onError={setError} />
        <form onSubmit={saveAlt} className="flex gap-2">
          <label className="sr-only" htmlFor={`alt-${item.id}`}>
            Alt-Text
          </label>
          <input
            id={`alt-${item.id}`}
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="Alt-Text (Bildbeschreibung)"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
          <button type="submit" className={secondaryButton} disabled={busy || alt === item.alt}>
            Speichern
          </button>
        </form>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Bild löschen?</span>
            <button type="button" className={dangerButton} onClick={remove} disabled={busy}>
              Endgültig löschen
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`${secondaryButton} self-start`}
            onClick={() => setConfirmDelete(true)}
            disabled={inUse}
            title={inUse ? "Verwendete Bilder können nicht gelöscht werden" : undefined}
          >
            Löschen
          </button>
        )}
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
