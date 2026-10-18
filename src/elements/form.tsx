"use client";

import { useId } from "react";
import { MediaPicker } from "@/app/admin/editor/media-picker";
import { inputClass, propertyFrame, secondaryButton } from "@/app/admin/ui";
import type { DataAttribute, MediaRefAttribute } from "./attributes";
import { ELEMENT_SCHEMAS, type ElementCandidate, type MediaRef } from "./schema";
import type { Attribute } from "./attributes";

// Edit-Modus aller Elemente: pro Attribut das Formular-Element seiner Art in einem Rahmen,
// untereinander in der Reihenfolge der Definition. Ein neues Element springt ins erste Textfeld.

export function ElementForm({
  element,
  onChange,
}: {
  element: ElementCandidate;
  onChange: (element: ElementCandidate) => void;
}) {
  const attributes = Object.entries(ELEMENT_SCHEMAS[element.type].attributes) as [string, Attribute][];
  const data = element.data as Record<string, unknown>;
  const focusKey = attributes.find(([, a]) => a.kind === "line" || a.kind === "markdown")?.[0];

  return (
    <div className="space-y-3">
      {attributes.map(([key, attribute]) =>
        attribute.kind === "mediaRef" ? (
          <MediaField
            key={key}
            attribute={attribute}
            media={"media" in element ? element.media : undefined}
            onPick={(media) => onChange({ ...element, mediaId: media.id, media } as ElementCandidate)}
          />
        ) : (
          <Field
            key={key}
            attribute={attribute}
            value={data[key]}
            autoFocus={key === focusKey}
            onChange={(value) => onChange({ ...element, data: { ...data, [key]: value } } as ElementCandidate)}
          />
        ),
      )}
    </div>
  );
}

function Field({
  attribute,
  value,
  autoFocus,
  onChange,
}: {
  attribute: DataAttribute;
  value: unknown;
  autoFocus: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const common = { id, placeholder: attribute.placeholder, "data-autofocus": autoFocus || undefined };

  return (
    <div className={propertyFrame}>
      <label htmlFor={id} className="block text-sm font-medium">
        {attribute.label}
      </label>
      {attribute.kind === "line" && (
        <input
          {...common}
          className={`${inputClass} w-full`}
          value={(value as string | undefined) ?? ""}
          // Ein optionales Feld ohne Eingabe ist nicht gesetzt.
          onChange={(e) => onChange(e.target.value === "" && !attribute.required ? undefined : e.target.value)}
        />
      )}
      {attribute.kind === "markdown" && (
        <textarea
          {...common}
          className={`${inputClass} min-h-60 w-full font-mono`}
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {attribute.kind === "select" && (
        <select
          {...common}
          className={inputClass}
          value={String(value)}
          onChange={(e) => onChange(attribute.options.find((o) => String(o.value) === e.target.value)?.value)}
        >
          {attribute.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function MediaField({
  attribute,
  media,
  onPick,
}: {
  attribute: MediaRefAttribute;
  media: MediaRef | undefined;
  onPick: (media: MediaRef) => void;
}) {
  return (
    <div className={propertyFrame}>
      <span className="block text-sm font-medium">{attribute.label}</span>
      {media && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
          <img src={media.url} alt={media.alt} className="h-20 w-28 rounded bg-zinc-100 object-contain" />
          <p className="text-xs text-zinc-500">
            Alt-Text: {media.alt || <span className="text-amber-700">fehlt – in der Mediathek ergänzen</span>}
          </p>
        </div>
      )}
      <MediaPicker
        label={media ? "Anderes Bild" : "Bild wählen"}
        buttonClass={secondaryButton}
        // Ein neues Element beginnt mit der Auswahl.
        initiallyOpen={!media}
        onPick={onPick}
      />
    </div>
  );
}
