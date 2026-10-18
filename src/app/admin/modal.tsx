"use client";

import { useEffect, useId, useRef } from "react";
import { CLOSE_ICON, Icon } from "./icons";

/**
 * Popup (modaler <dialog>), offen solange es eingeblendet ist. Schließen per ×, Escape oder
 * Klick auf den abgedunkelten Hintergrund meldet onClose; der Aufrufer blendet es dann aus.
 * locked: gerade nicht schließbar (z. B. während eines Uploads). Den Fokus bekommt ein Feld mit
 * data-autofocus.
 */
const SIZES = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-5xl" };

export function Modal({
  title,
  description,
  onClose,
  locked = false,
  size = "md",
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  locked?: boolean;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
    // showModal setzt den Fokus auf das erste fokussierbare Element; ein Feld mit data-autofocus
    // geht vor (autoFocus von React greift hier nicht, das Feld existiert vor dem Öffnen).
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (locked) e.preventDefault();
      }}
      // Auch ein vom Browser erzwungenes Schließen landet hier, damit der Zustand stimmt.
      onClose={onClose}
      // Klick auf den Hintergrund: Das Ereignis kommt dann vom dialog selbst.
      onClick={(e) => {
        if (e.target === ref.current && !locked) ref.current.close();
      }}
      className={`m-auto w-full ${SIZES[size]} rounded border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40`}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="text-sm text-zinc-600">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Schließen"
            title="Schließen"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
            disabled={locked}
            onClick={() => ref.current?.close()}
          >
            <Icon d={CLOSE_ICON} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
