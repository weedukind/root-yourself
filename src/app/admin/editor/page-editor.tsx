"use client";

import { useCallback, useState } from "react";
import { ViewElement } from "@/elements/components";
import {
  ADDABLE_TYPES,
  childrenOf,
  type ElementCandidate,
  type ElementContent,
  elementLabel,
  type ElementType,
  pathKey,
  takesChildren,
  type TreePath,
} from "@/elements/schema";
import { appendChild, canMoveInto, isFixed, moveInto, moveWithin, nodeAt, removeAt } from "@/elements/tree";
import { smallButton } from "../ui";
import { createElement, toView } from "./draft";
import { AddMenu, EditDialog, hasAttributes, hasEditMode } from "./edit-dialog";
import { type ElementAction, ElementTree } from "./element-tree";

// Inhalt einer Version bearbeiten. Wurzel ist die Seite, ihr Inhaltsbereich eine Liste; beide
// stehen fest. Rechts steht die Seite im View-Modus, ihr Inhaltsbereich in einem Rahmen mit
// „Bearbeiten“ (Listen zeigen ihre Kinder wie auf der Website). Am gewählten Element (Klick)
// zusätzlich „+ Element“ und „Einfügen“. Erst „Bearbeiten“ (oder Doppelklick) zeigt den
// Edit-Modus im Popup (edit-dialog.tsx): Formular und bei Containern ihre Kinder. Auf Wunsch
// („Baum einblenden“) links der Baum zur Navigation, mit allen Aktionen (auch verschieben,
// ausschneiden, löschen tief im Baum) im Menü; sonst nutzt die Ansicht die ganze Breite.
// Gespeichert wird mit der Version.

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

// Popup im Edit-Modus: der Baum beim Öffnen (beim Hinzufügen schon mit dem neuen Element) und
// das Element, das es zuerst zeigt.
type Dialog = { root: ElementCandidate; path: TreePath };

/** Die Aktionen an einem Element, gruppiert – der Baum zeigt sie als Menü, die Ansicht als Knöpfe. */
type Actions = {
  edit?: ElementAction;
  add: { type: ElementType; action: ElementAction }[];
  paste?: ElementAction;
  up?: ElementAction;
  down?: ElementAction;
  cut?: ElementAction;
  remove?: ElementAction;
};

export function PageEditor({
  root,
  problems,
  readOnly,
  onChange,
}: {
  root: ElementCandidate;
  problems: Map<string, string>;
  readOnly: boolean;
  onChange: (root: ElementCandidate) => void;
}) {
  // Gewähltes Element; zu Beginn keins.
  const [selected, setSelected] = useState<TreePath | null>(null);
  // Ausgeschnittenes Element, wartet auf „Einfügen“ in einen Container.
  const [cut, setCut] = useState<TreePath | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Der Editor erscheint erst nach dem Laden der Version im Browser, localStorage ist verfügbar.
  const [showTree, setShowTree] = useState(loadTreeVisible);
  // Nach Löschen oder Verschieben kann der Pfad ins Leere zeigen: dann keins.
  const current = selected && nodeAt(root, selected) ? selected : null;

  /** Strukturänderung; ein ausgeschnittener Pfad gilt danach nicht mehr. */
  function restructure(next: ElementCandidate, nextSelected: TreePath) {
    onChange(next);
    setSelected(nextSelected);
    setCut(null);
  }

  function edit(path: TreePath) {
    const node = nodeAt(root, path);
    setSelected(path);
    if (node && hasEditMode(node.type)) setDialog({ root, path });
  }

  /** Neues Element: erst im Popup ausfüllen (erst „Übernehmen“ fügt es ein); ohne Einstellungen (z. B. Slide) gleich einfügen. */
  function add(container: TreePath, type: ElementType) {
    const next = appendChild(root, container, createElement(type));
    const path = [...container, childrenOf(nodeAt(root, container)!).length];
    if (hasAttributes(type)) return setDialog({ root: next, path });
    restructure(next, path);
  }

  /** „Übernehmen“ im Popup; es bleibt offen. Ein ausgeschnittener Pfad gilt danach nicht mehr. */
  function apply(next: ElementCandidate) {
    onChange(next);
    setCut(null);
  }

  function actions(path: TreePath): Actions {
    const node = nodeAt(root, path)!;
    const result: Actions = { add: [] };
    if (hasEditMode(node.type)) result.edit = { label: "Bearbeiten", onSelect: () => edit(path) };
    if (takesChildren(node.type)) {
      result.add = ADDABLE_TYPES.map((type) => ({ type, action: { label: `${elementLabel(type)} hinzufügen`, onSelect: () => add(path, type) } }));
      if (cut) {
        const allowed = canMoveInto(root, cut, path);
        result.paste = {
          label: `„${elementLabel(nodeAt(root, cut)!.type)}“ hier einfügen`,
          disabled: !allowed,
          title: allowed ? undefined : "Nicht in sich selbst oder ein eigenes Kind",
          onSelect: () => {
            const moved = moveInto(root, cut, path);
            restructure(moved.root, moved.path);
          },
        };
      }
    }
    if (!isFixed(root, path)) {
      const parent = path.slice(0, -1);
      const index = path[path.length - 1];
      const siblings = childrenOf(nodeAt(root, parent)!).length;
      result.up = { label: "Nach oben", disabled: index === 0, onSelect: () => restructure(moveWithin(root, path, -1), [...parent, index - 1]) };
      result.down = {
        label: "Nach unten",
        disabled: index === siblings - 1,
        onSelect: () => restructure(moveWithin(root, path, 1), [...parent, index + 1]),
      };
      result.cut = { label: "Ausschneiden", onSelect: () => setCut(path) };
      result.remove = { label: "Löschen", danger: true, onSelect: () => restructure(removeAt(root, path), parent) };
    }
    return result;
  }

  const actionsFor = (path: TreePath): ElementAction[] => {
    const a = actions(path);
    return [a.edit, ...a.add.map((x) => x.action), a.paste, a.up, a.down, a.cut, a.remove].filter((x): x is ElementAction => Boolean(x));
  };

  /** Element im Baum gewählt: in der Ansicht dorthin scrollen. */
  const selectFromTree = useCallback((path: TreePath) => {
    setSelected(path);
    document.getElementById(`element-${pathKey(path)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  /** Ein Element der Ansicht in seinem Rahmen; die Seite rahmt so ihren Inhaltsbereich ein. */
  const framed = (content: ElementContent, path: TreePath): React.ReactNode => (
    <ElementFrame
      key={pathKey(path)}
      path={path}
      label={elementLabel(content.type)}
      selected={current !== null && pathKey(path) === pathKey(current)}
      isCut={cut !== null && pathKey(cut) === pathKey(path)}
      problem={problems.get(pathKey(path))}
      actions={readOnly ? undefined : actions(path)}
      onSelect={() => setSelected(path)}
      onEdit={() => edit(path)}
    >
      <ViewElement element={content} renderChild={(child, i) => framed(child, [...path, i])} />
    </ElementFrame>
  );

  return (
    <div
      className="space-y-3"
      onKeyDown={(e) => {
        // Esc hebt das Ausschneiden auf.
        if (e.key === "Escape" && cut) {
          e.preventDefault();
          setCut(null);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={smallButton}
          aria-expanded={showTree}
          aria-controls="element-tree"
          onClick={() => {
            saveTreeVisible(!showTree);
            setShowTree(!showTree);
          }}
        >
          {showTree ? "Baum ausblenden" : "Baum einblenden"}
        </button>
        {cut && <span className="text-xs text-zinc-500">Ausgeschnitten – an einem Container „Einfügen“, Esc hebt auf.</span>}
      </div>

      {/* Ohne Baum nutzt die Ansicht die ganze Breite. */}
      <div className={showTree ? "grid gap-4 md:grid-cols-[16rem_1fr]" : ""}>
        {showTree && (
          <nav
            id="element-tree"
            aria-label="Elemente"
            className="self-start rounded border border-zinc-200 bg-white p-2 md:sticky md:top-4 md:max-h-[80vh] md:overflow-auto"
          >
            <ElementTree
              root={root}
              selected={current}
              cut={cut}
              problems={problems}
              readOnly={readOnly}
              onSelect={selectFromTree}
              onEdit={edit}
              actionsFor={actionsFor}
            />
          </nav>
        )}

        <section aria-label="Ansicht" className="prose prose-zinc min-w-0 max-w-none">
          {framed(toView(root), [])}
        </section>
      </div>

      {dialog && (
        <EditDialog
          saved={root}
          initialRoot={dialog.root}
          initialPath={dialog.path}
          onApply={apply}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** Rahmen um ein Element in der Ansicht: Bezeichnung und Knöpfe, darunter seine View. */
function ElementFrame({
  path,
  label,
  selected,
  isCut,
  problem,
  actions,
  onSelect,
  onEdit,
  children,
}: {
  path: TreePath;
  label: string;
  selected: boolean;
  isCut: boolean;
  problem?: string;
  /** Fehlt bei eingefrorenen Versionen: dann keine Knöpfe. */
  actions?: Actions;
  onSelect: () => void;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const icon = `${smallButton} px-1.5 leading-none`;
  return (
    <div
      id={`element-${pathKey(path)}`}
      className={`rounded border p-2 ${selected ? "border-zinc-900 ring-1 ring-zinc-900" : problem ? "border-red-400" : "border-dashed border-zinc-300"} ${isCut ? "opacity-50" : ""}`}
      // Innere Rahmen gehen vor: nur das angeklickte Element wählen bzw. bearbeiten.
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        // Doppelklick auf Knöpfe (z. B. Pfeile eines Karussells) bearbeitet nicht.
        if (!(e.target as Element).closest("button") && actions?.edit) onEdit();
      }}
    >
      <div className="not-prose mb-1 flex flex-wrap items-center gap-1 text-xs">
        <span className="font-medium text-zinc-500">{label}</span>
        {actions && (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {actions.edit && (
              <button type="button" className={smallButton} onClick={actions.edit.onSelect}>
                Bearbeiten
              </button>
            )}
            {selected && actions.add.length > 0 && <AddMenu items={actions.add} />}
            {selected && actions.paste && (
              <button type="button" className={smallButton} disabled={actions.paste.disabled} title={actions.paste.title} onClick={actions.paste.onSelect}>
                Einfügen
              </button>
            )}
            {selected && actions.up && (
              <button type="button" className={icon} disabled={actions.up.disabled} aria-label="Nach oben" title="Nach oben" onClick={actions.up.onSelect}>
                ↑
              </button>
            )}
            {selected && actions.down && (
              <button type="button" className={icon} disabled={actions.down.disabled} aria-label="Nach unten" title="Nach unten" onClick={actions.down.onSelect}>
                ↓
              </button>
            )}
            {selected && actions.cut && (
              <button type="button" className={icon} aria-label="Ausschneiden" title="Ausschneiden" onClick={actions.cut.onSelect}>
                ✂
              </button>
            )}
            {selected && actions.remove && (
              <button type="button" className={`${icon} hover:text-red-600`} aria-label="Löschen" title="Löschen" onClick={actions.remove.onSelect}>
                ✕
              </button>
            )}
          </div>
        )}
      </div>
      {problem && <p className="not-prose mb-1 text-xs text-red-600">{problem}</p>}
      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </div>
  );
}
