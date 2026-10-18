"use client";

import { useCallback, useRef, useState } from "react";
import { ViewElement } from "@/elements/components";
import { ElementForm } from "@/elements/form";
import {
  ADDABLE_TYPES,
  childrenOf,
  completeElement,
  type DraftElement,
  type ElementCandidate,
  ELEMENT_SCHEMAS,
  elementLabel,
  elementProblems,
  type ElementType,
  takesChildren,
} from "@/elements/schema";
import { appendChild, moveWithin, removeAt, updateAt } from "@/elements/tree";
import { Modal } from "../modal";
import { primaryButton, secondaryButton, smallButton } from "../ui";
import { useDismiss } from "../use-dismiss";
import { createElement, toView } from "./draft";
import type { ElementAction } from "./element-tree";

// Edit-Modus eines Elements im Popup: das Formular aus seinen Attributen; bei Containern (Liste,
// Slide) darunter die Kinder im View-Modus, je in einem Rahmen mit „Bearbeiten“, ↑, ↓ und ✕, und
// „+ Element“. „Bearbeiten“ an einem Kind öffnet dessen Edit-Modus in einem weiteren Popup darüber;
// „Übernehmen“ dort ändert erst den Stand dieses Popups. „Übernehmen“ hier übernimmt das Element
// samt Kindern und ist gesperrt, solange etwas unvollständig ist.

export const hasAttributes = (type: ElementType) => Object.keys(ELEMENT_SCHEMAS[type].attributes).length > 0;
/** Ob ein Element einen Edit-Modus hat: Einstellungen oder Kinder zum Bearbeiten. */
export const hasEditMode = (type: ElementType) => hasAttributes(type) || takesChildren(type);

// Bearbeiten eines Kinds oder Hinzufügen eines neuen ans Ende.
type ChildDialog = { mode: "edit"; index: number; element: ElementCandidate } | { mode: "add"; element: ElementCandidate };

export function EditDialog({
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
  const [element, setElement] = useState(initial);
  const [child, setChild] = useState<ChildDialog | null>(null);
  const check = completeElement(element);
  const children = childrenOf(element);
  const problems = elementProblems(element);

  /** Neues Kind: erst im Popup ausfüllen; ohne Einstellungen (z. B. Slide) gleich einfügen. */
  function add(type: ElementType) {
    const created = createElement(type);
    if (hasAttributes(type)) setChild({ mode: "add", element: created });
    else setElement(appendChild(element, [], created));
  }

  function applyChild(next: DraftElement) {
    if (!child) return;
    setElement(child.mode === "edit" ? updateAt(element, [child.index], () => next) : appendChild(element, [], next));
    setChild(null);
  }

  return (
    <Modal title={title} size="xl" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (check.ok) onApply(check.element);
        }}
      >
        <ElementForm element={element} onChange={setElement} />
        {takesChildren(element.type) && (
          <section aria-label="Kinder" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-zinc-700">Elemente</h3>
              <AddMenu
                items={ADDABLE_TYPES.map((type) => ({ type, action: { label: `${elementLabel(type)} hinzufügen`, onSelect: () => add(type) } }))}
              />
            </div>
            {children.length === 0 && <p className="text-sm text-zinc-500 italic">Noch keine Elemente.</p>}
            <div className="prose prose-zinc max-w-none space-y-3">
              {children.map((node, i) => (
                <ChildFrame
                  key={node.key}
                  node={node}
                  problem={[...problems].find(([key]) => key === String(i) || key.startsWith(`${i}.`))?.[1]}
                  first={i === 0}
                  last={i === children.length - 1}
                  onEdit={() => setChild({ mode: "edit", index: i, element: node })}
                  onMove={(delta) => setElement(moveWithin(element, [i], delta))}
                  onRemove={() => setElement(removeAt(element, [i]))}
                />
              ))}
            </div>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryButton} disabled={!check.ok}>
            Übernehmen
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Abbrechen
          </button>
          {!check.ok && <span className="text-sm text-zinc-500">{check.problem}</span>}
        </div>
      </form>
      {/* Außerhalb des Formulars: Formulare dürfen nicht verschachtelt sein. */}
      {child && (
        <EditDialog
          title={`${elementLabel(child.element.type)} ${child.mode === "add" ? "hinzufügen" : "bearbeiten"}`}
          initial={child.element}
          onApply={applyChild}
          onClose={() => setChild(null)}
        />
      )}
    </Modal>
  );
}

/** Ein Kind im Edit-Modus seines Containers: Bezeichnung und Knöpfe, darunter seine View. */
function ChildFrame({
  node,
  problem,
  first,
  last,
  onEdit,
  onMove,
  onRemove,
}: {
  node: ElementCandidate;
  /** Problem des Kinds oder eines seiner Kinder. */
  problem?: string;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const icon = `${smallButton} px-1.5 leading-none`;
  const label = elementLabel(node.type);
  const editable = hasEditMode(node.type);
  return (
    <div
      className={`rounded border p-2 ${problem ? "border-red-400" : "border-dashed border-zinc-300"}`}
      onDoubleClick={(e) => {
        // Doppelklick auf Knöpfe (z. B. Pfeile eines Karussells) bearbeitet nicht.
        if (!(e.target as Element).closest("button") && editable) onEdit();
      }}
    >
      <div className="not-prose mb-1 flex flex-wrap items-center gap-1 text-xs">
        <span className="font-medium text-zinc-500">{label}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {editable && (
            <button type="button" className={smallButton} aria-label={`${label} bearbeiten`} onClick={onEdit}>
              Bearbeiten
            </button>
          )}
          <button type="button" className={icon} disabled={first} aria-label="Nach oben" title="Nach oben" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className={icon} disabled={last} aria-label="Nach unten" title="Nach unten" onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className={`${icon} hover:text-red-600`} aria-label="Löschen" title="Löschen" onClick={onRemove}>
            ✕
          </button>
        </div>
      </div>
      {problem && <p className="not-prose mb-1 text-xs text-red-600">{problem}</p>}
      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ViewElement element={toView(node)} />
      </div>
    </div>
  );
}

/** „+ Element“ mit der Liste der Typen. */
export function AddMenu({ items }: { items: { type: ElementType; action: ElementAction }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, close, { active: open });

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} className={smallButton} onClick={() => setOpen(!open)}>
        + Element
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-36 rounded border border-zinc-200 bg-white py-1 shadow-lg">
          {items.map(({ type, action }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
              onClick={() => {
                setOpen(false);
                action.onSelect();
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
