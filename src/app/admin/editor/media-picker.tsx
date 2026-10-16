"use client";

import { useEffect, useState } from "react";
import type { MediaFolder, MediaWithUsage } from "@/shared/api/media";
import type { MediaRef } from "@/shared/api/versions";
import { api } from "../api-client";
import { folderOptions } from "../media-folders";
import { inputClass, secondaryButton } from "../ui";

/** Bildauswahl aus der Mediathek. */
export function MediaPicker({
  label,
  onPick,
  buttonClass = secondaryButton,
  initiallyOpen = false,
}: {
  label: string;
  onPick: (media: MediaRef) => void;
  buttonClass?: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [folders, setFolders] = useState<MediaFolder[] | null>(null);
  // "": alle Ordner.
  const [folderId, setFolderId] = useState("");
  const [items, setItems] = useState<MediaWithUsage[] | null>(null);

  useEffect(() => {
    if (!open || folders) return;
    void api<MediaFolder[]>("/media/folders").then((result) => {
      if (result.ok) setFolders(result.value);
    });
  }, [open, folders]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void api<MediaWithUsage[]>(folderId ? `/media?folder=${folderId}` : "/media").then((result) => {
      if (current && result.ok) setItems(result.value);
    });
    return () => {
      current = false;
    };
  }, [open, folderId]);

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Bild aus der Mediathek wählen</span>
        <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setOpen(false)}>
          Schließen
        </button>
      </div>
      {folders && folders.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          Ordner
          <select
            className={inputClass}
            value={folderId}
            onChange={(e) => {
              setFolderId(e.target.value);
              setItems(null);
            }}
          >
            <option value="">Alle Ordner</option>
            {folderOptions(folders).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {items === null ? (
        <p className="text-sm text-zinc-500">Lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {folderId ? "In diesem Ordner liegen keine Bilder." : "Die Mediathek ist leer – zuerst Bilder hochladen."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded border border-zinc-200 bg-white hover:border-zinc-500"
                title={item.alt || item.filename}
                onClick={() => {
                  onPick({ id: item.id, url: item.url, width: item.width, height: item.height, alt: item.alt });
                  setOpen(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
                <img src={item.url} alt={item.alt} className="aspect-square w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
