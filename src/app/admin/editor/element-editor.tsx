"use client";

import { useEffect, useState } from "react";
import type { MediaWithUsage } from "@/shared/api/media";
import type { MediaRef } from "@/shared/api/versions";
import { api } from "../api-client";
import { inputClass, secondaryButton } from "../ui";
import type { DraftElement } from "./draft";

// Formulare für die einzelnen Elementtypen. Ein neuer Elementtyp braucht hier ein Formular.

const TYPE_LABEL: Record<DraftElement["type"], string> = { heading: "Überschrift", text: "Text", image: "Bild" };

export const elementLabel = (element: DraftElement) => TYPE_LABEL[element.type];

export function ElementForm({
  element,
  onChange,
  readOnly,
}: {
  element: DraftElement;
  onChange: (element: DraftElement) => void;
  readOnly: boolean;
}) {
  switch (element.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select
            aria-label="Ebene"
            className={inputClass}
            value={element.data.level}
            disabled={readOnly}
            onChange={(e) => onChange({ ...element, data: { ...element.data, level: Number(e.target.value) as 2 | 3 } })}
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input
            aria-label="Überschrift"
            className={`${inputClass} min-w-0 flex-1 font-semibold`}
            placeholder="Überschrift"
            value={element.data.text}
            readOnly={readOnly}
            onChange={(e) => onChange({ ...element, data: { ...element.data, text: e.target.value } })}
          />
        </div>
      );
    case "text":
      return (
        <textarea
          aria-label="Text (Markdown)"
          className={`${inputClass} min-h-28 w-full font-mono`}
          placeholder="Text – Markdown: **fett**, *kursiv*, [Link](https://…), - Liste"
          value={element.data.markdown}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...element, data: { markdown: e.target.value } })}
        />
      );
    case "image":
      return (
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
          <img src={element.media.url} alt={element.media.alt} className="h-20 w-28 rounded bg-zinc-100 object-contain" />
          <div className="min-w-0 flex-1 space-y-1">
            <input
              aria-label="Bildunterschrift"
              className={`${inputClass} w-full`}
              placeholder="Bildunterschrift (optional)"
              value={element.data.caption ?? ""}
              readOnly={readOnly}
              onChange={(e) => onChange({ ...element, data: { caption: e.target.value || undefined } })}
            />
            <p className="text-xs text-zinc-500">
              Alt-Text: {element.media.alt || <span className="text-amber-700">fehlt – in der Mediathek ergänzen</span>}
            </p>
            {!readOnly && (
              <MediaPicker
                label="Anderes Bild"
                onPick={(media) => onChange({ ...element, mediaId: media.id, media })}
              />
            )}
          </div>
        </div>
      );
  }
}

/** Bildauswahl aus der Mediathek. */
export function MediaPicker({
  label,
  onPick,
  buttonClass = secondaryButton,
}: {
  label: string;
  onPick: (media: MediaRef) => void;
  buttonClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaWithUsage[] | null>(null);

  useEffect(() => {
    if (!open || items) return;
    void api<MediaWithUsage[]>("/media").then((result) => {
      if (result.ok) setItems(result.value);
    });
  }, [open, items]);

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
      {items === null ? (
        <p className="text-sm text-zinc-500">Lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Die Mediathek ist leer – zuerst Bilder hochladen.</p>
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
