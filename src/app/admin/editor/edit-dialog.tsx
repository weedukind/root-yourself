"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewElement } from "@/elements/components";
import { ElementForm } from "@/elements/form";
import {
  ADDABLE_TYPES,
  childrenOf,
  type ElementCandidate,
  ELEMENT_SCHEMAS,
  elementLabel,
  elementProblems,
  type ElementType,
  pathKey,
  takesChildren,
  type TreePath,
} from "@/elements/schema";
import { appendChild, moveWithin, nodeAt, removeAt, updateAt } from "@/elements/tree";
import { Modal } from "../modal";
import { primaryButton, secondaryButton, smallButton } from "../ui";
import { useDismiss } from "../use-dismiss";
import { createElement, toView } from "./draft";
import type { ElementAction } from "./element-tree";

// Edit-Modus im Popup: das Formular des Elements aus seinen Attributen; bei Containern (Liste,
// Slide) darunter die Kinder im View-Modus, je in einem Rahmen mit „Bearbeiten“, ↑, ↓ und ✕, und
// „+ Element“. „Bearbeiten“ an einem Kind ersetzt den Inhalt des Popups durch dessen Edit-Modus;
// der Titel zeigt den Pfad im Baum, ein Klick auf eine Stufe geht dorthin zurück. Das Popup
// arbeitet auf einer Kopie des ganzen Baums: „Übernehmen“ übernimmt alle Änderungen in den
// Entwurf, „Abbrechen“ stellt den Entwurf wieder her; beide lassen das Popup offen und sind nur
// aktiv, wenn es Änderungen gibt. Schließen (×, Esc, Klick daneben) verwirft nicht übernommene
// Änderungen. Gesperrt ist „Übernehmen“, solange ein Element ein Problem hat, das es im Entwurf
// noch nicht hat (z. B. ein neues Bild ohne gewähltes Bild).

export const hasAttributes = (type: ElementType) => Object.keys(ELEMENT_SCHEMAS[type].attributes).length > 0;
/** Ob ein Element einen Edit-Modus hat: Einstellungen oder Kinder zum Bearbeiten. */
export const hasEditMode = (type: ElementType) => hasAttributes(type) || takesChildren(type);

const parsePath = (key: string): TreePath => (key === "" ? [] : key.split(".").map(Number));

/** Probleme eines Baums nach dem key des Elements – stabil auch beim Umsortieren. */
function problemsByKey(root: ElementCandidate): Map<string, string> {
  return new Map([...elementProblems(root)].map(([path, problem]) => [nodeAt(root, parsePath(path))!.key, problem]));
}

/** Der Pfad selbst oder sein nächster Vorfahre, den es im Baum gibt und der einen Edit-Modus hat. */
function nearestEditable(root: ElementCandidate, path: TreePath): TreePath {
  for (let depth = path.length; depth > 0; depth--) {
    const node = nodeAt(root, path.slice(0, depth));
    if (node && hasEditMode(node.type)) return path.slice(0, depth);
  }
  return [];
}

export function EditDialog({
  saved,
  initialRoot,
  initialPath,
  onApply,
  onClose,
}: {
  /** Der Entwurf, wie er gerade ist: Ausgangsstand für „Abbrechen“ und den Vergleich auf Änderungen. */
  saved: ElementCandidate;
  /** Der Baum beim Öffnen (bei „hinzufügen“ schon mit dem neuen Element). */
  initialRoot: ElementCandidate;
  /** Das Element, dessen Edit-Modus das Popup zuerst zeigt. */
  initialPath: TreePath;
  onApply: (root: ElementCandidate) => void;
  onClose: () => void;
}) {
  const [root, setRoot] = useState(initialRoot);
  const [path, setPath] = useState(initialPath);
  const element = nodeAt(root, path)!;
  const children = childrenOf(element);
  const problems = elementProblems(root);
  const changed = JSON.stringify(root) !== JSON.stringify(saved);
  const before = problemsByKey(saved);
  const added = [...problemsByKey(root)].find(([key, problem]) => before.get(key) !== problem);
  const change = (next: ElementCandidate) => setRoot(updateAt(root, path, () => next));
  const form = useRef<HTMLFormElement>(null);

  // Anderes Element: ins erste Textfeld (beim Öffnen macht das schon Modal).
  useEffect(() => {
    form.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [path]);

  /** Neues Kind: ans Ende; mit Einstellungen gleich in seinen Edit-Modus. */
  function add(type: ElementType) {
    setRoot(appendChild(root, path, createElement(type)));
    if (hasAttributes(type)) setPath([...path, children.length]);
  }

  return (
    <Modal title={<Breadcrumb root={root} path={path} onSelect={setPath} />} size="xl" onClose={onClose}>
      <form
        ref={form}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && !added) onApply(root);
        }}
      >
        {/* key: Beim Wechsel des Elements beginnt das Formular neu (Fokus aufs erste Feld). */}
        <ElementForm key={element.key} element={element} onChange={change} />
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
              {children.map((node, i) => {
                const childKey = pathKey([...path, i]);
                return (
                  <ChildFrame
                    key={node.key}
                    node={node}
                    problem={[...problems].find(([key]) => key === childKey || key.startsWith(`${childKey}.`))?.[1]}
                    first={i === 0}
                    last={i === children.length - 1}
                    onEdit={() => setPath([...path, i])}
                    onMove={(delta) => setRoot(moveWithin(root, [...path, i], delta))}
                    onRemove={() => setRoot(removeAt(root, [...path, i]))}
                  />
                );
              })}
            </div>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryButton} disabled={!changed || Boolean(added)}>
            Übernehmen
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={!changed}
            onClick={() => {
              setRoot(saved);
              setPath(nearestEditable(saved, path));
            }}
          >
            Abbrechen
          </button>
          {added && <span className="text-sm text-zinc-500">{added[1]}</span>}
        </div>
      </form>
    </Modal>
  );
}

/** Pfad im Baum bis zum bearbeiteten Element; Stufen mit Edit-Modus führen dorthin zurück. */
function Breadcrumb({ root, path, onSelect }: { root: ElementCandidate; path: TreePath; onSelect: (path: TreePath) => void }) {
  const steps = [[], ...path.map((_, i) => path.slice(0, i + 1))];
  return (
    <span className="flex flex-wrap items-center gap-1">
      {steps.map((step, i) => {
        const node = nodeAt(root, step)!;
        const label = elementLabel(node.type);
        const last = i === steps.length - 1;
        return (
          <span key={pathKey(step)} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-400">›</span>}
            {last || !hasEditMode(node.type) ? (
              <span aria-current={last ? "location" : undefined} className={last ? "" : "font-normal text-zinc-500"}>
                {label}
              </span>
            ) : (
              <button type="button" className="font-normal text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline" onClick={() => onSelect(step)}>
                {label}
              </button>
            )}
          </span>
        );
      })}
    </span>
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
