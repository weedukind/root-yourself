"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type ImageType,
  type Media,
  type MediaFolder,
  type MediaWithUsage,
  type PreparedUpload,
} from "@/shared/api/media";
import type { TagRef, TagWithUsage } from "@/shared/api/tags";
import { api, type ApiResult } from "@/app/admin/api-client";
import { folderOptions, pathLabel, pathOf } from "@/app/admin/media-folders";
import { dangerButton, ErrorText, inputClass, primaryButton, secondaryButton } from "@/app/admin/ui";
import { FolderTree } from "./folder-tree";

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
async function uploadFile(file: File, folderId: string): Promise<ApiResult<Media>> {
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
    body: { key: prepared.value.key, folderId, filename: file.name, ...size },
  });
}

export function MediaLibrary({ initialFolderId }: { initialFolderId: string | null }) {
  const [folders, setFolders] = useState<MediaFolder[] | null>(null);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [items, setItems] = useState<MediaWithUsage[] | null>(null);
  const [allTags, setAllTags] = useState<TagWithUsage[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  // Ohne Ordner zeigt die oberste Ebene nur Ordner – außer bei einem Tag-Filter: dann alle Treffer.
  const showImages = folderId !== null || filterTag !== "";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (folderId) params.set("folder", folderId);
    if (filterTag) params.set("tag", filterTag);
    const [foldersResult, mediaResult, tagsResult] = await Promise.all([
      api<MediaFolder[]>("/media/folders"),
      showImages ? api<MediaWithUsage[]>(`/media?${params}`) : Promise.resolve(null),
      api<TagWithUsage[]>("/tags"),
    ]);
    if (tagsResult.ok) setAllTags(tagsResult.value);
    if (!foldersResult.ok) return setLoadError(foldersResult.error);
    setFolders(foldersResult.value);
    if (mediaResult && !mediaResult.ok) return setLoadError(mediaResult.error);
    setItems(mediaResult ? mediaResult.value : []);
    setLoadError(null);
  }, [folderId, filterTag, showImages]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Inhalt laden, auch nach Ordner- oder Filterwechsel
    void load();
  }, [load]);

  function open(id: string | null) {
    setFolderId(id);
    setItems(null);
    // Den Ordner in der Adresse merken, damit Neuladen und Zurück-Links dort landen.
    window.history.replaceState(null, "", id ? `?folder=${id}` : window.location.pathname);
  }

  const current = folders?.find((f) => f.id === folderId) ?? null;
  // Ein gelöschter oder unbekannter Ordner aus der Adresse: zurück nach oben.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auf die oberste Ebene ausweichen
    if (folders && folderId && !current) open(null);
  }, [folders, folderId, current]);

  if (!folders) return loadError ? <ErrorText error={loadError} /> : <p className="text-sm text-zinc-500">Lädt …</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Ordner" className="space-y-2 md:border-r md:border-zinc-200 md:pr-4">
        <FolderTree folders={folders} currentId={folderId} onOpen={open} onChanged={load} />
      </nav>

      <div className="min-w-0 space-y-6">
        <Breadcrumb folders={folders} currentId={folderId} onOpen={open} />


        {current ? (
          <Uploader key={current.id} folderId={current.id} onUploaded={load} />
        ) : (
          <p className="text-sm text-zinc-500">
            Bilder liegen immer in einem Ordner. Zum Hochladen links einen Ordner öffnen oder mit „+“ einen anlegen.
          </p>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="filter-tag" className="text-sm font-medium">
            Filter
          </label>
          <select id="filter-tag" className={inputClass} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="">{current ? "Alle Bilder in diesem Ordner" : "Kein Tag-Filter"}</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name} ({tag.mediaCount})
              </option>
            ))}
          </select>
          {!current && filterTag && <span className="text-xs text-zinc-500">sucht in allen Ordnern</span>}
        </div>
        <ErrorText error={loadError} />

        {showImages &&
          (items === null ? (
            !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {filterTag ? "Keine Bilder mit diesem Tag." : "In diesem Ordner liegen noch keine Bilder."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  folders={folders}
                  showFolder={!current}
                  allTags={allTags}
                  onChanged={load}
                />
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Breadcrumb({
  folders,
  currentId,
  onOpen,
}: {
  folders: MediaFolder[];
  currentId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const path = pathOf(folders, currentId);
  return (
    <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" className="text-zinc-600 underline hover:text-zinc-900" onClick={() => onOpen(null)}>
        Mediathek
      </button>
      {path.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span className="text-zinc-400">/</span>
          {i === path.length - 1 ? (
            <span className="font-semibold">{folder.name}</span>
          ) : (
            <button type="button" className="text-zinc-600 underline hover:text-zinc-900" onClick={() => onOpen(folder.id)}>
              {folder.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

type UploadStatus = { name: string; state: "läuft" | "fertig" | "fehler"; error?: ApiError };

function Uploader({ folderId, onUploaded }: { folderId: string; onUploaded: () => Promise<void> }) {
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const busy = statuses.some((s) => s.state === "läuft");

  async function upload(files: File[]) {
    setStatuses(files.map((f) => ({ name: f.name, state: "läuft" })));
    await Promise.all(
      files.map(async (file, index) => {
        const result = await uploadFile(file, folderId);
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
        Bilder in diesen Ordner hochladen
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
  folders,
  showFolder,
  allTags,
  onChanged,
}: {
  item: MediaWithUsage;
  folders: MediaFolder[];
  /** Ordnerpfad anzeigen, wenn die Liste Bilder aus mehreren Ordnern zeigt. */
  showFolder: boolean;
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

  async function move(folderId: string) {
    setBusy(true);
    const result = await api<Media>(`/media/${item.id}`, { method: "PATCH", body: { folderId, updatedAt: item.updatedAt } });
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
          {showFolder && <p className="truncate text-xs text-zinc-500">📁 {pathLabel(folders, item.folderId)}</p>}
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          Ordner
          <select
            className={`${inputClass} min-w-0 flex-1 text-xs`}
            value={item.folderId}
            disabled={busy}
            onChange={(e) => void move(e.target.value)}
          >
            {folderOptions(folders).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
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
