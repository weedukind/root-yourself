"use client";

import { useEffect, useRef } from "react";
import { useDismiss } from "@/app/admin/use-dismiss";

// Kontextmenü des Ordnerbaums mit Tastenkürzeln.

// Tastenkürzel für die Menü-Aktionen, wirksam auf dem Ordner mit dem Fokus (siehe shortcutAction).
export type Action = "rename" | "create" | "cut" | "paste" | "delete";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const SHORTCUT_LABEL: Record<Action, () => string> = {
  rename: () => "F2",
  create: () => "N",
  cut: () => (isMac() ? "⌘X" : "Strg+X"),
  paste: () => (isMac() ? "⌘V" : "Strg+V"),
  delete: () => (isMac() ? "⌘⌫" : "Entf"),
};

// Für aria-keyshortcuts.
const SHORTCUT_ARIA: Record<Action, string> = {
  rename: "F2",
  create: "N",
  cut: "Control+X Meta+X",
  paste: "Control+V Meta+V",
  delete: "Delete Meta+Backspace",
};

export function shortcutAction(e: React.KeyboardEvent): Action | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "F2" && !mod && !e.altKey) return "rename";
  if (e.key.toLowerCase() === "n" && !mod && !e.altKey && !e.shiftKey) return "create";
  if (mod && !e.altKey && e.key.toLowerCase() === "x") return "cut";
  if (mod && !e.altKey && e.key.toLowerCase() === "v") return "paste";
  if ((e.key === "Delete" && !mod) || (e.key === "Backspace" && e.metaKey)) return "delete";
  return null;
}

export type MenuItem = {
  action: Action;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
};

export function ContextMenu({
  x,
  y,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { closeOnScroll: true });

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  // Pfeiltasten wandern zwischen den aktiven Einträgen.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  const itemClass =
    "w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:text-zinc-400 disabled:hover:bg-transparent";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="fixed z-50 min-w-48 rounded border border-zinc-200 bg-white py-1 shadow-lg"
      // Nicht über den Fensterrand hinaus.
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - items.length * 34 - 16) }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          aria-keyshortcuts={SHORTCUT_ARIA[item.action]}
          className={`${itemClass} flex items-center justify-between gap-6 ${item.danger ? "text-red-600" : ""}`}
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <span>{item.label}</span>
          <kbd className="font-sans text-xs text-zinc-400">{SHORTCUT_LABEL[item.action]()}</kbd>
        </button>
      ))}
    </div>
  );
}
