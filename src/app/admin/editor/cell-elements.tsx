"use client";

import { useEffect, useRef, useState } from "react";
import { EditElement, elementLabel, ViewElement } from "@/elements/admin";
import { completeElement, type ElementCandidate, ELEMENT_TYPES, type ElementType } from "@/elements/schema";
import { inputClass, primaryButton, secondaryButton } from "../ui";
import {
  cellTargets,
  createElement,
  type Draft,
  type DraftElement,
  type ElementPath,
  insertElement,
  moveElementToCell,
  moveElementWithinCell,
  removeElement,
  updateElement,
} from "./draft";

// Die Elemente einer Zelle im View-Modus, mit Steuerelementen (↑ ↓ verschieben ✎ ✕) und
// „+ Element“ darunter. Hinzufügen und Bearbeiten öffnen den Edit-Modus in einem Popup;
// „Übernehmen“ ändert nur den Entwurf, gespeichert wird mit der Version.

type Update = (change: (draft: Draft) => Draft) => void;

const small = `${secondaryButton} px-2 py-0.5 text-xs`;

// index: Stelle in der Zelle – beim Bearbeiten das Element, beim Hinzufügen der Einfügeplatz.
type Dialog = { mode: "add" | "edit"; index: number; element: ElementCandidate };

export function CellElements({
  draft,
  update,
  row,
  cell,
  readOnly,
}: {
  draft: Draft;
  update: Update;
  row: number;
  cell: number;
  readOnly: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const elements = draft.rows[row].cells[cell].elements;
  const targets = cellTargets(draft);

  const add = (index: number) => (type: ElementType) =>
    setDialog({ mode: "add", index, element: createElement(type) });

  function apply(element: DraftElement) {
    if (!dialog) return;
    const { mode, index } = dialog;
    update((d) =>
      mode === "add" ? insertElement(d, row, cell, index, element) : updateElement(d, { row, cell, index }, element),
    );
    setDialog(null);
  }

  return (
    <div className="space-y-1">
      {elements.map((element, i) => {
        const path: ElementPath = { row, cell, index: i };
        return (
          <div key={element.key} className="space-y-1">
            <div className="group rounded border border-zinc-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs font-medium text-zinc-500">{elementLabel(element.type)}</span>
                {!readOnly && (
                  <div className="ml-auto flex flex-wrap gap-1">
                    <button type="button" className={small} disabled={i === 0} onClick={() => update((d) => moveElementWithinCell(d, path, -1))} aria-label="Element nach oben">
                      ↑
                    </button>
                    <button type="button" className={small} disabled={i === elements.length - 1} onClick={() => update((d) => moveElementWithinCell(d, path, 1))} aria-label="Element nach unten">
                      ↓
                    </button>
                    {targets.length > 1 && (
                      <select
                        aria-label="In andere Zelle verschieben"
                        className={`${inputClass} py-0 text-xs`}
                        value=""
                        onChange={(e) => {
                          const target = targets[Number(e.target.value)];
                          update((d) => moveElementToCell(d, path, target));
                        }}
                      >
                        <option value="" disabled>
                          Verschieben nach …
                        </option>
                        {targets.map((t, index) =>
                          t.row === row && t.cell === cell ? null : (
                            <option key={t.label} value={index}>
                              {t.label}
                            </option>
                          ),
                        )}
                      </select>
                    )}
                    <button type="button" className={small} onClick={() => setDialog({ mode: "edit", index: i, element })} aria-label="Element bearbeiten" title="Bearbeiten (oder Doppelklick)">
                      ✎
                    </button>
                    <button type="button" className={small} onClick={() => update((d) => removeElement(d, path))} aria-label="Element entfernen">
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <div
                className="prose prose-zinc max-w-none"
                onDoubleClick={readOnly ? undefined : () => setDialog({ mode: "edit", index: i, element })}
              >
                <ViewElement element={element} />
              </div>
            </div>
            {!readOnly && <AddElementMenu onAdd={add(i + 1)} />}
          </div>
        );
      })}

      {!readOnly && elements.length === 0 && <AddElementMenu onAdd={add(0)} />}

      {dialog && (
        <ElementDialog
          title={`${elementLabel(dialog.element.type)} ${dialog.mode === "add" ? "hinzufügen" : "bearbeiten"}`}
          initial={dialog.element}
          onApply={apply}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** „+ Element“ mit einer Liste der Elementtypen. */
function AddElementMenu({ onAdd }: { onAdd: (type: ElementType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
        onClick={() => setOpen(!open)}
      >
        + Element hinzufügen
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-1 min-w-36 rounded border border-zinc-200 bg-white py-1 shadow-lg">
          {ELEMENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
              onClick={() => {
                setOpen(false);
                onAdd(type);
              }}
            >
              {elementLabel(type)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Edit-Modus im Popup. Escape, „Abbrechen“ oder ein Klick daneben verwerfen. */
function ElementDialog({
  title,
  initial,
  onApply,
  onClose,
}: {
  title: string;
  initial: ElementCandidate;
  onApply: (element: DraftElement) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [element, setElement] = useState(initial);
  const check = completeElement(element);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      // Klick auf den abgedunkelten Hintergrund schließt (das Ereignis kommt dann vom dialog selbst).
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close();
      }}
      className="m-auto w-full max-w-2xl rounded border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (check.ok) onApply(check.element);
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Schließen"
            className="rounded px-2 text-xl leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            onClick={() => ref.current?.close()}
          >
            ×
          </button>
        </div>
        <EditElement element={element} onChange={setElement} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryButton} disabled={!check.ok}>
            Übernehmen
          </button>
          <button type="button" className={secondaryButton} onClick={() => ref.current?.close()}>
            Abbrechen
          </button>
          {!check.ok && <span className="text-sm text-zinc-500">{check.problem}</span>}
        </div>
      </form>
    </dialog>
  );
}
