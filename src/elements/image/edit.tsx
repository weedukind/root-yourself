"use client";

import { MediaPicker } from "@/app/admin/editor/media-picker";
import { inputClass } from "@/app/admin/ui";
import type { EditProps } from "../types";

export function ImageEdit({ element, onChange }: EditProps<"image">) {
  const picked = element.mediaId !== "";
  return (
    <div className="space-y-3">
      {picked && (
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
          <img src={element.media.url} alt={element.media.alt} className="h-20 w-28 rounded bg-zinc-100 object-contain" />
          <div className="min-w-0 flex-1 space-y-1">
            <input
              aria-label="Bildunterschrift"
              className={`${inputClass} w-full`}
              placeholder="Bildunterschrift (optional)"
              value={element.data.caption ?? ""}
              onChange={(e) => onChange({ ...element, data: { caption: e.target.value || undefined } })}
            />
            <p className="text-xs text-zinc-500">
              Alt-Text: {element.media.alt || <span className="text-amber-700">fehlt – in der Mediathek ergänzen</span>}
            </p>
          </div>
        </div>
      )}
      <MediaPicker
        label={picked ? "Anderes Bild" : "Bild wählen"}
        // Ein neues Bild-Element beginnt mit der Auswahl.
        initiallyOpen={!picked}
        onPick={(media) => onChange({ ...element, mediaId: media.id, media })}
      />
    </div>
  );
}
