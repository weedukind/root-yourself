"use client";

import { useState } from "react";
import { inputClass } from "./ui";

/**
 * Feld zum Bearbeiten an Ort und Stelle: Enter übernimmt (getrimmt), Escape oder Wegklicken
 * verwirft. Während onSubmit läuft, ist das Feld gesperrt; schlägt es fehl, bleibt es offen.
 */
export function InlineEdit({
  label,
  initial,
  placeholder,
  required = false,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  /** Leere Eingabe ignorieren. */
  required?: boolean;
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (required && !trimmed) return;
    setBusy(true);
    await onSubmit(trimmed);
    setBusy(false);
  }

  return (
    <input
      aria-label={label}
      className={`${inputClass} w-full`}
      placeholder={placeholder}
      value={value}
      // readOnly statt disabled: Ein gesperrtes Feld verliert den Fokus, danach greift Escape nicht mehr.
      readOnly={busy}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          void submit();
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (!busy) onCancel();
      }}
    />
  );
}
