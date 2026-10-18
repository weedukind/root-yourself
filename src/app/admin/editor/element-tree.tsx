"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { childrenOf, type ElementCandidate, elementLabel, pathKey, type TreePath } from "@/elements/schema";
import { summary } from "@/elements/tree";
import { useDismiss } from "../use-dismiss";

// Baum der Seite zur Navigation: die Wurzel (die Seite), darunter Container und ihre Kinder,
// beliebig tief. Klick wählt ein Element (die Ansicht scrollt dorthin), Doppelklick bearbeitet
// es. Das Menü eines Knotens (Rechtsklick oder „⋯“) bietet dieselben Aktionen wie die Knöpfe in
// der Ansicht (page-editor.tsx, actionsFor). Unvollständige Elemente sind rot markiert.

/** Eine Aktion an einem Element – im Menü des Baums und als Knopf in der Ansicht. */
export type ElementAction = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; title?: string };

type Menu = { path: TreePath; x: number; y: number };

export function ElementTree({
  root,
  selected,
  cut,
  problems,
  readOnly,
  onSelect,
  onEdit,
  actionsFor,
}: {
  root: ElementCandidate;
  selected: TreePath | null;
  cut: TreePath | null;
  /** Probleme nach Pfad (elementProblems). */
  problems: Map<string, string>;
  readOnly: boolean;
  onSelect: (path: TreePath) => void;
  onEdit: (path: TreePath) => void;
  actionsFor: (path: TreePath) => ElementAction[];
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <div>
      <ul>
        <TreeNode
          node={root}
          path={[]}
          selected={selected}
          cut={cut}
          problems={problems}
          onSelect={onSelect}
          onEdit={readOnly ? undefined : onEdit}
          onMenu={readOnly ? undefined : (path, x, y) => setMenu({ path, x, y })}
          hasMenu={(path) => actionsFor(path).length > 0}
        />
      </ul>
      {/* In body: Im Baum (sticky, eigene Stapelebene) läge es sonst unter der Leiste mit „Speichern“. */}
      {menu && createPortal(<NodeMenu x={menu.x} y={menu.y} items={actionsFor(menu.path)} onClose={closeMenu} />, document.body)}
    </div>
  );
}

function TreeNode({
  node,
  path,
  selected,
  cut,
  problems,
  onSelect,
  onEdit,
  onMenu,
  hasMenu,
}: {
  node: ElementCandidate;
  path: TreePath;
  selected: TreePath | null;
  cut: TreePath | null;
  problems: Map<string, string>;
  onSelect: (path: TreePath) => void;
  onEdit?: (path: TreePath) => void;
  /** Fehlt bei eingefrorenen Versionen: dann kein Menü. */
  onMenu?: (path: TreePath, x: number, y: number) => void;
  /** Ob es am Element überhaupt Aktionen gibt (die Seite hat keine). */
  hasMenu: (path: TreePath) => boolean;
}) {
  const key = pathKey(path);
  const active = selected !== null && key === pathKey(selected);
  const menuButton = useRef<HTMLButtonElement>(null);
  const children = childrenOf(node);
  const text = summary(node);
  const openMenu = hasMenu(path) ? onMenu : undefined;

  return (
    <li>
      <div
        className={`group flex items-center rounded ${active ? "bg-zinc-200" : "hover:bg-zinc-100"} ${cut && pathKey(cut) === key ? "opacity-50" : ""}`}
        onContextMenu={(e) => {
          if (!openMenu) return;
          e.preventDefault();
          openMenu(path, e.clientX, e.clientY);
        }}
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={() => onSelect(path)}
          onDoubleClick={() => onEdit?.(path)}
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
        {openMenu && (
          <button
            ref={menuButton}
            type="button"
            aria-label={`Aktionen für ${elementLabel(node.type)}${text ? ` ${text}` : ""}`}
            aria-haspopup="menu"
            className="rounded px-1 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-300 hover:text-zinc-900 focus:opacity-100"
            onClick={() => {
              const rect = menuButton.current!.getBoundingClientRect();
              openMenu(path, rect.left, rect.bottom);
            }}
          >
            ⋯
          </button>
        )}
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
              onEdit={onEdit}
              onMenu={onMenu}
              hasMenu={hasMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeMenu({ x, y, items, onClose }: { x: number; y: number; items: ElementAction[]; onClose: () => void }) {
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
          title={item.title}
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
