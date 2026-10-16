"use client";

import { useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, type ImageType, type Media, type MediaFolder, type PreparedUpload } from "@/shared/api/media";
import { api, type ApiResult } from "@/app/admin/api-client";
import { Modal } from "@/app/admin/modal";
import { primaryIconButton } from "@/app/admin/ui";
import { Icon, UPLOAD_ICON } from "./icons";

const ACCEPT = Object.keys(IMAGE_TYPES).join(",");

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

type UploadStatus = { name: string; state: "läuft" | "fertig" | "fehler"; error?: ApiError };

/** „Bilder hochladen“ öffnet ein Popup mit dem Formular. Schließt sich selbst, wenn alles geklappt hat. */
export function Uploader({ folder, onUploaded }: { folder: MediaFolder; onUploaded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const busy = statuses.some((s) => s.state === "läuft");

  async function upload(files: File[]) {
    setStatuses(files.map((f) => ({ name: f.name, state: "läuft" })));
    const results = await Promise.all(
      files.map(async (file, index) => {
        const result = await uploadFile(file, folder.id);
        setStatuses((current) =>
          current.map((s, i) =>
            i === index ? { ...s, state: result.ok ? "fertig" : "fehler", error: result.ok ? undefined : result.error } : s,
          ),
        );
        return result.ok;
      }),
    );
    await onUploaded();
    if (results.every(Boolean)) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={primaryIconButton}
        aria-label="Bilder hochladen"
        title="Bilder hochladen"
        onClick={() => {
          setStatuses([]);
          setOpen(true);
        }}
      >
        <Icon d={UPLOAD_ICON} />
      </button>
      {open && (
        <Modal
          title="Bilder hochladen"
          description={`In den Ordner „${folder.name}“`}
          // Während des Uploads nicht schließen.
          locked={busy}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-2">
            <label className="sr-only" htmlFor="upload">
              Bilder auswählen
            </label>
            <input
              id="upload"
              type="file"
              accept={ACCEPT}
              multiple
              disabled={busy}
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-white"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void upload(files);
              }}
            />
            <p className="text-xs text-zinc-500">JPEG, PNG, WebP, AVIF oder GIF, höchstens 20 MB pro Bild. Mehrere auf einmal möglich.</p>
          </div>
          {statuses.length > 0 && (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {statuses.map((s, i) => (
                <li key={i} className={s.state === "fehler" ? "text-red-600" : "text-zinc-600"}>
                  {s.name}: {s.state === "fehler" ? (s.error?.message ?? "Fehler") : s.state}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
