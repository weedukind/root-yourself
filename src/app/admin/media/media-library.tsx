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
import { api, type ApiResult } from "../api-client";
import { dangerButton, ErrorText, inputClass, primaryButton, secondaryButton } from "../ui";

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
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const result = await api<MediaWithUsage[]>("/media");
    if (result.ok) {
      setItems(result.value);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden der Liste
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Uploader onUploaded={load} />
      <ErrorText error={loadError} />
      {items === null ? (
        !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Bilder.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onChanged={load} />
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

function MediaCard({ item, onChanged }: { item: MediaWithUsage; onChanged: () => Promise<void> }) {
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
