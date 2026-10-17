"use client";

import { useCallback, useRef, useState } from "react";
import { ElementForm } from "@/elements/form";
import {
  childrenOf,
  completeElement,
  type DraftElement,
  type ElementCandidate,
  ELEMENT_SCHEMAS,
  elementLabel,
  elementProblems,
  ELEMENT_TYPES,
  isContainer,
  pathKey,
  type TreePath,
} from "@/elements/schema";
import { appendChild, canMoveInto, moveInto, moveWithin, nodeAt, removeAt, summary, updateAt } from "@/elements/tree";
import { Modal } from "../modal";
import { primaryButton, secondaryButton } from "../ui";
import { useDismiss } from "../use-dismiss";
import { createElement } from "./draft";

// Popup eines Container-Elements (z. B. Slide): links ein Baum zur Navigation – die Wurzel ist
// der Container, die Zweige seine Kinder, beliebig tief –, rechts das Formular des gewählten
// Elements. Kinder hinzufügen, verschieben, ausschneiden/einfügen und löschen über das Menü
// eines Knotens (Rechtsklick oder „⋯“). „Übernehmen“ übernimmt den ganzen Baum in den Entwurf und
// ist gesperrt, solange ein Element unvollständig ist (im Baum markiert).

type Menu = { path: TreePath; x: number; y: number };
type MenuItem = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

export function ContainerDialog({
  title,
  initial,
  select = [],
  onApply,
  onClose,
}: {
  title: string;
  initial: ElementCandidate;
  /** Zu Beginn gewähltes Element (z. B. per Doppelklick in der View). */
  select?: TreePath;
  onApply: (element: DraftElement) => void;
  onClose: () => void;
}) {
  const [root, setRoot] = useState(initial);
  const [selected, setSelected] = useState<TreePath>(nodeAt(initial, select) ? select : []);
  // Ausgeschnittenes Element, wartet auf „Einfügen“ in einen Container.
  const [cut, setCut] = useState<TreePath | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const problems = elementProblems(root);
  const check = completeElement(root);
  const node = nodeAt(root, selected) ?? root;

  /** Strukturänderung: neuer Baum, neue Auswahl; ein ausgeschnittener Pfad gilt danach nicht mehr. */
  function restructure(next: ElementCandidate, nextSelected: TreePath) {
    setRoot(next);
    setSelected(nextSelected);
    setCut(null);
  }

  function menuItems(path: TreePath): MenuItem[] {
    const target = nodeAt(root, path)!;
    const items: MenuItem[] = [];
    if (isContainer(target.type)) {
      for (const type of ELEMENT_TYPES) {
        items.push({
          label: `${elementLabel(type)} hinzufügen`,
          onSelect: () => restructure(appendChild(root, path, createElement(type)), [...path, childrenOf(target).length]),
        });
      }
      if (cut) {
        items.push({
          label: `„${elementLabel(nodeAt(root, cut)!.type)}“ hier einfügen`,
          disabled: !canMoveInto(root, cut, path),
          onSelect: () => {
            const moved = moveInto(root, cut, path);
            restructure(moved.root, moved.path);
          },
        });
      }
    }
    if (path.length > 0) {
      const index = path[path.length - 1];
      const siblings = childrenOf(nodeAt(root, path.slice(0, -1))!).length;
      const parent = path.slice(0, -1);
      items.push(
        { label: "Nach oben", disabled: index === 0, onSelect: () => restructure(moveWithin(root, path, -1), [...parent, index - 1]) },
        {
          label: "Nach unten",
          disabled: index === siblings - 1,
          onSelect: () => restructure(moveWithin(root, path, 1), [...parent, index + 1]),
        },
        { label: "Ausschneiden", onSelect: () => setCut(path) },
        { label: "Löschen", danger: true, onSelect: () => restructure(removeAt(root, path), parent) },
      );
    }
    return items;
  }

  const hasAttributes = Object.keys(ELEMENT_SCHEMAS[node.type].attributes).length > 0;

  return (
    <Modal title={title} size="xl" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (check.ok) onApply(check.element);
        }}
        onKeyDown={(e) => {
          // Escape hebt zuerst das Ausschneiden auf, erst dann schließt es das Popup.
          if (e.key === "Escape" && cut) {
            e.preventDefault();
            setCut(null);
          }
        }}
      >
        {/* Mindesthöhe: Das Popup springt nicht in der Höhe, wenn man zwischen Elementen wechselt. */}
        <div className="grid gap-4 md:min-h-[60vh] md:grid-cols-[16rem_1fr]">
          <nav aria-label="Elemente" className="max-h-[60vh] overflow-auto md:border-r md:border-zinc-200 md:pr-3">
            <ul>
              <TreeNode
                node={root}
                path={[]}
                selected={selected}
                cut={cut}
                problems={problems}
                onSelect={setSelected}
                onMenu={(path, x, y) => setMenu({ path, x, y })}
              />
            </ul>
          </nav>
          <section aria-label="Formular" className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">{elementLabel(node.type)}</h3>
            {hasAttributes ? (
              <ElementForm
                key={pathKey(selected)}
                element={node}
                onChange={(next) => setRoot((current) => updateAt(current, selected, () => next))}
              />
            ) : (
              <p className="text-sm text-zinc-500">
                Keine Einstellungen.{" "}
                {isContainer(node.type) && "Links über das Menü (Rechtsklick oder „⋯“) Elemente hinzufügen oder eines wählen."}
              </p>
            )}
            {problems.get(pathKey(selected)) && <p className="text-sm text-red-600">{problems.get(pathKey(selected))}</p>}
          </section>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryButton} disabled={!check.ok}>
            Übernehmen
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Abbrechen
          </button>
          {problems.size > 0 && (
            <span className="text-sm text-zinc-500">
              {problems.size === 1 ? "1 Element ist" : `${problems.size} Elemente sind`} unvollständig (im Baum markiert).
            </span>
          )}
          {cut && <span className="text-sm text-zinc-500">Ausgeschnitten – im Menü eines Containers „hier einfügen“, Esc hebt auf.</span>}
        </div>
      </form>
      {menu && <NodeMenu x={menu.x} y={menu.y} items={menuItems(menu.path)} onClose={closeMenu} />}
    </Modal>
  );
}

function TreeNode({
  node,
  path,
  selected,
  cut,
  problems,
  onSelect,
  onMenu,
}: {
  node: ElementCandidate;
  path: TreePath;
  selected: TreePath;
  cut: TreePath | null;
  problems: Map<string, string>;
  onSelect: (path: TreePath) => void;
  onMenu: (path: TreePath, x: number, y: number) => void;
}) {
  const key = pathKey(path);
  const active = key === pathKey(selected);
  const menuButton = useRef<HTMLButtonElement>(null);
  const children = childrenOf(node);
  const text = summary(node);

  return (
    <li>
      <div
        className={`group flex items-center rounded ${active ? "bg-zinc-200" : "hover:bg-zinc-100"} ${cut && pathKey(cut) === key ? "opacity-50" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(path, e.clientX, e.clientY);
        }}
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={() => onSelect(path)}
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          {problems.has(key) && (
            <span className="text-red-600" title={problems.get(key)} aria-label="unvollständig">
              ●
            </span>
          )}
          <span className="shrink-0 font-medium">{elementLabel(node.type)}</span>
          {text && <span className="min-w-0 truncate text-zinc-500">{text}</span>}
        </button>
        <button
          ref={menuButton}
          type="button"
          aria-label={`Aktionen für ${elementLabel(node.type)}${text ? ` ${text}` : ""}`}
          aria-haspopup="menu"
          className="rounded px-1 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-300 hover:text-zinc-900 focus:opacity-100"
          onClick={() => {
            const rect = menuButton.current!.getBoundingClientRect();
            onMenu(path, rect.left, rect.bottom);
          }}
        >
          ⋯
        </button>
      </div>
      {children.length > 0 && (
        <ul className="ml-3 border-l border-zinc-200 pl-2">
          {children.map((child, i) => (
            <TreeNode
              key={child.key}
              node={child}
              path={[...path, i]}
              selected={selected}
              cut={cut}
              problems={problems}
              onSelect={onSelect}
              onMenu={onMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { closeOnScroll: true });

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-48 rounded border border-zinc-200 bg-white py-1 shadow-lg"
      // Nicht über den Fensterrand hinaus.
      style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - items.length * 34 - 16) }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:text-zinc-400 disabled:hover:bg-transparent ${item.danger ? "text-red-600" : ""}`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
