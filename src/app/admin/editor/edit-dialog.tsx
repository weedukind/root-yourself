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
import { appendChild, canMoveInto, isFixed, moveInto, moveWithin, nodeAt, removeAt, updateAt } from "@/elements/tree";
import { Modal } from "../modal";
import { ADD_ICON, APPLY_ICON, DELETE_ICON, DOWN_ICON, EDIT_ICON, Icon, REVERT_ICON, TREE_ICON, UP_ICON } from "../icons";
import { iconButton, primaryIconButton, propertyFrame, smallIconButton } from "../ui";
import { useDismiss } from "../use-dismiss";
import { createElement, toView } from "./draft";
import { type ElementAction, ElementTree } from "./element-tree";

// Edit-Modus im Popup: das Formular des Elements aus seinen Attributen; bei Containern (Liste,
// Slide) darunter die Kinder im View-Modus, je in einem Rahmen mit „Bearbeiten“, ↑, ↓ und ✕, und
// „+ Element“. „Bearbeiten“ an einem Kind ersetzt den Inhalt des Popups durch dessen Edit-Modus;
// der Titel zeigt den Pfad im Baum, ein Klick auf eine Stufe geht dorthin zurück. Das Popup
// arbeitet auf einer Kopie des ganzen Baums: „Übernehmen“ übernimmt alle Änderungen in den
// Entwurf, „Abbrechen“ stellt den Entwurf wieder her; beide lassen das Popup offen und sind nur
// aktiv, wenn es Änderungen gibt. Schließen (×, Esc, Klick daneben) verwirft nicht übernommene
// Änderungen. Gesperrt ist „Übernehmen“, solange ein Element ein Problem hat, das es im Entwurf
// noch nicht hat (z. B. ein neues Bild ohne gewähltes Bild).
// Im Edit-Modus eines Containers blendet ein Knopf links den Baum ein: das Element, für das das
// Popup geöffnet wurde, mit allen Nachfahren. Klick auf einen Knoten zeigt dessen Edit-Modus; sein
// Menü (Rechtsklick oder „⋯“) bietet hinzufügen, nach oben/unten, ausschneiden/einfügen (auch in
// einen anderen Container) und löschen. Esc hebt das Ausschneiden auf.

// Ob der Baum eingeblendet ist, merkt sich der Browser (nur Komfort; ohne Speicher: ausgeblendet).
const TREE_KEY = "editor-tree-visible";

function loadTreeVisible(): boolean {
  try {
    return localStorage.getItem(TREE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveTreeVisible(visible: boolean) {
  try {
    localStorage.setItem(TREE_KEY, visible ? "1" : "0");
  } catch {
    // Ohne Speicher bleibt es beim Zustand dieser Seite.
  }
}

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
  initialPath,
  onApply,
  onClose,
}: {
  /** Der Entwurf, wie er gerade ist: Ausgangsstand für „Abbrechen“ und den Vergleich auf Änderungen. */
  saved: ElementCandidate;
  /** Das Element, für das das Popup geöffnet wird; zugleich die Wurzel des Baums links. */
  initialPath: TreePath;
  onApply: (root: ElementCandidate) => void;
  onClose: () => void;
}) {
  const [root, setRoot] = useState(saved);
  const [path, setPath] = useState(initialPath);
  // Ausgeschnittenes Element, wartet auf „Einfügen“ in einen Container (Menü im Baum).
  const [cut, setCut] = useState<TreePath | null>(null);
  // Das Popup erscheint erst nach einem Klick, localStorage ist verfügbar.
  const [showTree, setShowTree] = useState(loadTreeVisible);
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

  /** Strukturänderung; ein ausgeschnittener Pfad gilt danach nicht mehr. */
  function restructure(next: ElementCandidate, nextPath = path) {
    setRoot(next);
    setPath(nearestEditable(next, nextPath));
    setCut(null);
  }

  /** Neues Kind ans Ende von container; mit Einstellungen gleich in seinen Edit-Modus. */
  function add(container: TreePath, type: ElementType) {
    const index = childrenOf(nodeAt(root, container)!).length;
    restructure(appendChild(root, container, createElement(type)), hasAttributes(type) ? [...container, index] : path);
  }

  // Baum links: Pfade darin sind relativ zum Element des Popups (initialPath).
  const base = initialPath;
  const abs = (rel: TreePath) => [...base, ...rel];
  const rel = (p: TreePath | null) =>
    p && p.length >= base.length && base.every((index, i) => p[i] === index) ? p.slice(base.length) : null;
  const treeProblems = new Map(
    [...problems].flatMap(([key, problem]) => {
      const inner = rel(parsePath(key));
      return inner ? [[pathKey(inner), problem] as const] : [];
    }),
  );

  function treeActions(relPath: TreePath): ElementAction[] {
    const target = abs(relPath);
    const node = nodeAt(root, target)!;
    const items: ElementAction[] = [];
    if (hasEditMode(node.type)) items.push({ label: "Bearbeiten", onSelect: () => setPath(target) });
    if (takesChildren(node.type)) {
      for (const type of ADDABLE_TYPES) items.push({ label: `${elementLabel(type)} hinzufügen`, onSelect: () => add(target, type) });
      if (cut) {
        const allowed = canMoveInto(root, cut, target);
        items.push({
          label: `„${elementLabel(nodeAt(root, cut)!.type)}“ hier einfügen`,
          disabled: !allowed,
          title: allowed ? undefined : "Nicht in sich selbst oder ein eigenes Kind",
          onSelect: () => {
            const moved = moveInto(root, cut, target);
            restructure(moved.root, moved.path);
          },
        });
      }
    }
    // Das Element des Popups selbst bleibt, wo es ist; sonst zeigte der Baum ins Leere.
    if (relPath.length > 0 && !isFixed(root, target)) {
      const parent = target.slice(0, -1);
      const index = target[target.length - 1];
      const siblings = childrenOf(nodeAt(root, parent)!).length;
      items.push(
        // Danach zeigt das Popup den Container, dessen Kinder sich geändert haben.
        { label: "Nach oben", disabled: index === 0, onSelect: () => restructure(moveWithin(root, target, -1), parent) },
        { label: "Nach unten", disabled: index === siblings - 1, onSelect: () => restructure(moveWithin(root, target, 1), parent) },
        { label: "Ausschneiden", onSelect: () => setCut(target) },
        { label: "Löschen", danger: true, onSelect: () => restructure(removeAt(root, target), parent) },
      );
    }
    return items;
  }

  const treeToggle = (
    <button
      type="button"
      className={`${smallIconButton} ${showTree ? "bg-zinc-200" : ""}`}
      aria-label={showTree ? "Baum ausblenden" : "Baum einblenden"}
      title={showTree ? "Baum ausblenden" : "Baum einblenden"}
      aria-expanded={showTree}
      aria-controls="element-tree"
      onClick={() => {
        saveTreeVisible(!showTree);
        setShowTree(!showTree);
      }}
    >
      <Icon d={TREE_ICON} small />
    </button>
  );

  return (
    <Modal title={<Breadcrumb root={root} path={path} onSelect={setPath} />} size="xl" onClose={onClose}>
      <div
        className={showTree ? "grid gap-4 md:grid-cols-[14rem_1fr]" : ""}
        onKeyDown={(e) => {
          // Esc hebt zuerst das Ausschneiden auf, erst dann schließt es das Popup.
          if (e.key === "Escape" && cut) {
            e.preventDefault();
            setCut(null);
          }
        }}
      >
        {showTree && (
          <nav id="element-tree" aria-label="Elemente" className="self-start rounded border border-zinc-200 bg-white p-2 md:max-h-[70vh] md:overflow-auto">
            <ElementTree
              root={nodeAt(root, base)!}
              selected={rel(path)}
              cut={rel(cut)}
              problems={treeProblems}
              readOnly={false}
              onSelect={(relPath) => setPath(abs(relPath))}
              onEdit={(relPath) => setPath(abs(relPath))}
              actionsFor={treeActions}
            />
            {cut && <p className="mt-2 text-xs text-zinc-500">Ausgeschnitten – im Menü eines Containers „Einfügen“, Esc hebt auf.</p>}
          </nav>
        )}
        <form
          ref={form}
          className="min-w-0 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (changed && !added) onApply(root);
          }}
        >
          {/* key: Beim Wechsel des Elements beginnt das Formular neu (Fokus aufs erste Feld). */}
          <ElementForm key={element.key} element={element} onChange={change} />
          {takesChildren(element.type) && (
            // Die Kinder sind eine Eigenschaft wie die Attribute darüber: mit Bezeichnung und Rahmen.
            <section aria-label="Elemente" className={propertyFrame}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Elemente</h3>
                <div className="flex items-center gap-1">
                  {treeToggle}
                  <AddMenu
                    items={ADDABLE_TYPES.map((type) => ({ type, action: { label: `${elementLabel(type)} hinzufügen`, onSelect: () => add(path, type) } }))}
                  />
                </div>
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
                      onMove={(delta) => restructure(moveWithin(root, [...path, i], delta))}
                      onRemove={() => restructure(removeAt(root, [...path, i]))}
                    />
                  );
                })}
              </div>
            </section>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={primaryIconButton} aria-label="Übernehmen" title="Übernehmen" disabled={!changed || Boolean(added)}>
              <Icon d={APPLY_ICON} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label="Abbrechen"
              title="Abbrechen: Änderungen verwerfen"
              disabled={!changed}
              onClick={() => restructure(saved)}
            >
              <Icon d={REVERT_ICON} />
            </button>
            {added && <span className="text-sm text-zinc-500">{added[1]}</span>}
          </div>
        </form>
      </div>
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
            <button type="button" className={smallIconButton} aria-label={`${label} bearbeiten`} title="Bearbeiten" onClick={onEdit}>
              <Icon d={EDIT_ICON} small />
            </button>
          )}
          <button type="button" className={smallIconButton} disabled={first} aria-label="Nach oben" title="Nach oben" onClick={() => onMove(-1)}>
            <Icon d={UP_ICON} small />
          </button>
          <button type="button" className={smallIconButton} disabled={last} aria-label="Nach unten" title="Nach unten" onClick={() => onMove(1)}>
            <Icon d={DOWN_ICON} small />
          </button>
          <button type="button" className={`${smallIconButton} hover:text-red-600`} aria-label="Löschen" title="Löschen" onClick={onRemove}>
            <Icon d={DELETE_ICON} small />
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
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Element hinzufügen"
        title="Element hinzufügen"
        className={smallIconButton}
        onClick={() => setOpen(!open)}
      >
        <Icon d={ADD_ICON} small />
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
