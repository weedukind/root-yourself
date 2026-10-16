"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { MediaFolder } from "@/shared/api/media";
import { api } from "@/app/admin/api-client";
import { canMoveFolder, childrenOf, pathOf } from "@/app/admin/media-folders";
import { InlineEdit } from "@/app/admin/inline-edit";
import { ErrorText } from "@/app/admin/ui";
import { useDismiss } from "@/app/admin/use-dismiss";

// Ordnerbaum der Mediathek mit Kontextmenü (Rechtsklick oder „⋯“): Umbenennen, Unterordner
// erstellen, Ausschneiden/Einfügen (Verschieben), Löschen (nur leere Ordner). „Alle Ordner“ hat
// ein Menü mit „Einfügen“ für die oberste Ebene. Umbenennen und Anlegen geschehen direkt im Baum.
// Ausgeschnittene Bilder (aus der Bildliste) fügt „Einfügen“ auf einem Ordner dort ein; die
// Zwischenablage teilen sich Ordner und Bilder, das letzte Ausschneiden gilt.
// Ordner lassen sich am Griff vor dem Namen (erscheint beim Überfahren) auf einen anderen Ordner
// oder auf „Alle Ordner“ (oberste Ebene) ziehen. Nur der Griff ist ziehbar: Eine ziehbare Zeile
// mit Klick-Elementen darin startet nicht in jedem Browser zuverlässig. Ziele, die canMoveFolder ablehnt (er selbst, seine Unterordner, sein jetziger
// Platz), nehmen nichts an; der Server prüft Zyklen zusätzlich.

// Tastenkürzel für die Menü-Aktionen, wirksam auf dem Ordner mit dem Fokus (siehe shortcutAction).
type Action = "rename" | "create" | "cut" | "paste" | "delete";

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

function shortcutAction(e: React.KeyboardEvent): Action | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "F2" && !mod && !e.altKey) return "rename";
  if (e.key.toLowerCase() === "n" && !mod && !e.altKey && !e.shiftKey) return "create";
  if (mod && !e.altKey && e.key.toLowerCase() === "x") return "cut";
  if (mod && !e.altKey && e.key.toLowerCase() === "v") return "paste";
  if ((e.key === "Delete" && !mod) || (e.key === "Backspace" && e.metaKey)) return "delete";
  return null;
}

/** Inhalt der Zwischenablage: ein ausgeschnittener Ordner oder ausgeschnittene Bilder. */
export type Clipboard =
  | { kind: "folder"; id: string }
  | { kind: "media"; items: { id: string; folderId: string; updatedAt: string }[] };

// folder null: Menü von „Alle Ordner“ (oberste Ebene).
type Menu = { folder: MediaFolder | null; x: number; y: number };

// Aufgeklappte Ordner merkt sich der Browser (nur Komfort; fehlt der Speicher, ist alles zu).
const EXPANDED_KEY = "media-folders-expanded";

function loadExpanded(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(ids: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    // Ohne Speicher bleibt es beim Zustand dieser Seite.
  }
}

// So lange muss ein gezogener Ordner über einem zugeklappten Ordner stehen, bis der aufklappt.
const EXPAND_ON_HOVER_MS = 600;
// folderId null mit "create": neuer Ordner auf der obersten Ebene.
type Editing = { folderId: string | null; mode: "rename" | "create" };

export function FolderTree({
  folders,
  currentId,
  onOpen,
  onChanged,
  clipboard,
  onClipboard,
  onPasteMedia,
}: {
  folders: MediaFolder[];
  currentId: string | null;
  onOpen: (id: string | null) => void;
  onChanged: () => Promise<void>;
  clipboard: Clipboard | null;
  onClipboard: (clipboard: Clipboard | null) => void;
  /** Ausgeschnittene Bilder in den Ordner verschieben; liefert den ersten Fehler. */
  onPasteMedia: (folderId: string) => Promise<ApiError | null>;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<{ folderId: string | null; error: ApiError } | null>(null);
  // Stabil, sonst meldet das Menü seine Fenster-Listener bei jedem Rendern neu an.
  const closeMenu = useCallback(() => setMenu(null), []);
  // Ausgeschnittener Ordner, wartet auf „Einfügen“.
  const cut = clipboard?.kind === "folder" ? clipboard.id : null;
  const setCut = (folderId: string | null) => onClipboard(folderId ? { kind: "folder", id: folderId } : null);
  const cutMedia = clipboard?.kind === "media" ? clipboard.items : null;
  const [dragging, setDragging] = useState<string | null>(null);
  // Ordner-ID des Ziels unter dem Mauszeiger, "top" für die oberste Ebene.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Der Baum erscheint erst nach dem Laden im Browser, localStorage ist hier also verfügbar.
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  // Zugeklappter Ordner, über dem gerade ein Ordner gezogen wird; klappt nach kurzer Zeit auf.
  const [hoverId, setHoverId] = useState<string | null>(null);

  const setOpen = useCallback((ids: string[], open: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (open) next.add(id);
        else next.delete(id);
      }
      saveExpanded(next);
      return next;
    });
  }, []);

  // Der Weg zum geöffneten Ordner ist immer aufgeklappt, auch nach einem Sprung über die Adresse.
  const ancestors = pathOf(folders, currentId)
    .slice(0, -1)
    .map((f) => f.id)
    .join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Weg zum geöffneten Ordner aufklappen
    if (ancestors) setOpen(ancestors.split(","), true);
  }, [ancestors, setOpen]);

  useEffect(() => {
    if (!hoverId) return;
    const timer = setTimeout(() => setOpen([hoverId], true), EXPAND_ON_HOVER_MS);
    return () => clearTimeout(timer);
  }, [hoverId, setOpen]);

  const collapsedWithChildren = (folderId: string) =>
    !expanded.has(folderId) && (folders.find((f) => f.id === folderId)?.folderCount ?? 0) > 0;

  async function move(folderId: string, targetId: string | null) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const result = await api<MediaFolder>(`/media/folders/${folderId}`, {
      method: "PATCH",
      body: { parentId: targetId, updatedAt: folder.updatedAt },
    });
    if (!result.ok) return setError({ folderId, error: result.error });
    setError(null);
    // Das Ziel aufklappen, damit der verschobene Ordner sichtbar bleibt.
    if (targetId) setOpen([targetId], true);
    await onChanged();
  }

  /** Props für ein Ablageziel; targetId null: oberste Ebene. */
  function dropZone(targetId: string | null) {
    const key = targetId ?? "top";
    const allowed = dragging !== null && canMoveFolder(folders, dragging, targetId);
    return {
      highlighted: allowed && dropTarget === key,
      props: {
        onDragOver: (e: React.DragEvent) => {
          if (!dragging) return;
          if (targetId && collapsedWithChildren(targetId)) setHoverId(targetId);
          if (!allowed) {
            e.dataTransfer.dropEffect = "none";
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget(key);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setHoverId((current) => (current === targetId ? null : current));
          setDropTarget((current) => (current === key ? null : current));
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const folderId = dragging;
          setHoverId(null);
          setDragging(null);
          setDropTarget(null);
          if (folderId && canMoveFolder(folders, folderId, targetId)) void move(folderId, targetId);
        },
      },
    };
  }

  async function remove(folder: MediaFolder) {
    if (!window.confirm(`Ordner „${folder.name}“ löschen?`)) return;
    const result = await api<null>(`/media/folders/${folder.id}`, { method: "DELETE" });
    if (!result.ok) return setError({ folderId: folder.id, error: result.error });
    setError(null);
    // Leere Ordner haben keine Unterordner; war er geöffnet, geht es zum Elternordner.
    if (folder.id === currentId) onOpen(folder.parentId);
    await onChanged();
  }

  const context = {
    folders,
    currentId,
    editing,
    error,
    onOpen,
    openMenu: (folder: MediaFolder, x: number, y: number) => setMenu({ folder, x, y }),
    finish: async (folderId: string | null, result: { ok: true } | { ok: false; error: ApiError }) => {
      if (!result.ok) return setError({ folderId, error: result.error });
      setError(null);
      setEditing(null);
      await onChanged();
    },
    cancel: () => {
      setEditing(null);
      setError(null);
    },
    dragging,
    dropZone,
    startDrag: (folderId: string) => {
      setMenu(null);
      setDragging(folderId);
    },
    cut,
    endDrag: () => {
      setHoverId(null);
      setDragging(null);
      setDropTarget(null);
    },
    shortcut: (folder: MediaFolder, e: React.KeyboardEvent) => handleShortcut(folder, e),
    isOpen: (folderId: string) => expanded.has(folderId),
    toggle: (folderId: string) => setOpen([folderId], !expanded.has(folderId)),
  };
  const top = dropZone(null);
  const cutFolder = folders.find((f) => f.id === cut) ?? null;

  function pasteItem(targetId: string | null): MenuItem {
    if (cutMedia) return pasteMediaItem(cutMedia, targetId);
    const allowed = cutFolder !== null && canMoveFolder(folders, cutFolder.id, targetId);
    return {
      action: "paste",
      label: cutFolder ? `„${cutFolder.name}“ einfügen` : "Einfügen",
      disabled: !allowed,
      title: !cutFolder
        ? "Zuerst einen Ordner ausschneiden"
        : allowed
          ? undefined
          : "Nicht in sich selbst, einen eigenen Unterordner oder an den jetzigen Platz",
      onSelect: () => {
        if (!cutFolder) return;
        setCut(null);
        void move(cutFolder.id, targetId);
      },
    };
  }

  function pasteMediaItem(items: { folderId: string }[], targetId: string | null): MenuItem {
    const moving = targetId === null ? 0 : items.filter((i) => i.folderId !== targetId).length;
    return {
      action: "paste",
      label: `${items.length === 1 ? "1 Bild" : `${items.length} Bilder`} einfügen`,
      disabled: moving === 0,
      title:
        targetId === null
          ? "Bilder liegen immer in einem Ordner"
          : moving === 0
            ? "Die Bilder liegen schon in diesem Ordner"
            : undefined,
      onSelect: () => {
        if (targetId === null) return;
        onClipboard(null);
        void onPasteMedia(targetId).then((pasteError) =>
          setError(pasteError ? { folderId: targetId, error: pasteError } : null),
        );
      },
    };
  }

  /** Tastenkürzel auf einem Ordner (null: „Alle Ordner“); true, wenn die Taste verbraucht wurde. */
  function handleShortcut(folder: MediaFolder | null, e: React.KeyboardEvent): boolean {
    if (e.key === "Escape" && clipboard) {
      onClipboard(null);
      return true;
    }
    const action = shortcutAction(e);
    const item = action && menuItems({ folder, x: 0, y: 0 }).find((i) => i.action === action);
    if (!item) return false;
    e.preventDefault();
    if (item.disabled) {
      // Gesperrt: den Grund dort zeigen, wo der Fokus ist.
      setError({
        folderId: folder?.id ?? null,
        error: { kind: "invalid", code: "not_allowed", message: item.title ?? "Hier nicht möglich" },
      });
    } else {
      setError(null);
      item.onSelect();
    }
    return true;
  }

  const menuLabel = (m: Menu) => (m.folder ? `Aktionen für ${m.folder.name}` : "Aktionen für die oberste Ebene");

  function menuItems({ folder }: Menu): MenuItem[] {
    if (!folder) return [pasteItem(null)];
    const empty = folder.mediaCount === 0 && folder.folderCount === 0;
    return [
      { action: "rename", label: "Umbenennen", onSelect: () => setEditing({ folderId: folder.id, mode: "rename" }) },
      {
        action: "create",
        label: "Unterordner erstellen",
        onSelect: () => {
          setOpen([folder.id], true);
          setEditing({ folderId: folder.id, mode: "create" });
        },
      },
      cut === folder.id
        ? { action: "cut", label: "Ausschneiden aufheben", onSelect: () => setCut(null) }
        : { action: "cut", label: "Ausschneiden", onSelect: () => setCut(folder.id) },
      pasteItem(folder.id),
      {
        action: "delete",
        label: `Löschen${empty ? "" : " (nicht leer)"}`,
        danger: true,
        disabled: !empty,
        title: empty ? undefined : "Nur leere Ordner lassen sich löschen",
        onSelect: () => void remove(folder),
      },
    ];
  }

  return (
    <>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpen(null)}
          onKeyDown={(e) => void handleShortcut(null, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ folder: null, x: e.clientX, y: e.clientY });
          }}
          {...top.props}
          className={`block min-w-0 flex-1 rounded px-2 py-1 text-left text-sm font-medium ${top.highlighted ? "bg-zinc-100 ring-2 ring-zinc-500" : currentId === null ? "bg-zinc-200" : "hover:bg-zinc-100"}`}
        >
          Alle Ordner
          {dragging && canMoveFolder(folders, dragging, null) && (
            <span className="block text-xs font-normal text-zinc-500">hierher: auf die oberste Ebene</span>
          )}
        </button>
        <button
          type="button"
          aria-label="Neuen Ordner auf der obersten Ebene anlegen"
          title="Neuer Ordner"
          onClick={() => {
            setError(null);
            setEditing({ folderId: null, mode: "create" });
          }}
          className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          +
        </button>
      </div>
      {error?.folderId === null && editing?.folderId !== null && (
        <div className="px-2">
          <ErrorText error={error.error} />
        </div>
      )}
      <Branch parentId={null} context={context} />
      {menu && <ContextMenu x={menu.x} y={menu.y} label={menuLabel(menu)} items={menuItems(menu)} onClose={closeMenu} />}
    </>
  );
}

type Context = {
  folders: MediaFolder[];
  currentId: string | null;
  editing: Editing | null;
  error: { folderId: string | null; error: ApiError } | null;
  onOpen: (id: string) => void;
  openMenu: (folder: MediaFolder, x: number, y: number) => void;
  finish: (folderId: string | null, result: { ok: true } | { ok: false; error: ApiError }) => Promise<void>;
  cancel: () => void;
  dragging: string | null;
  cut: string | null;
  dropZone: (targetId: string | null) => { highlighted: boolean; props: React.HTMLAttributes<HTMLElement> };
  startDrag: (folderId: string) => void;
  endDrag: () => void;
  shortcut: (folder: MediaFolder, e: React.KeyboardEvent) => boolean;
  isOpen: (folderId: string) => boolean;
  toggle: (folderId: string) => void;
};

function Branch({ parentId, context }: { parentId: string | null; context: Context }) {
  const children = childrenOf(context.folders, parentId);
  const creating = context.editing?.mode === "create" && context.editing.folderId === parentId;
  if (children.length === 0 && !creating) return null;

  return (
    <ul className={parentId ? "ml-3 border-l border-zinc-200 pl-2" : ""}>
      {creating && (
        <li>
          <FolderNameInput
            label={parentId ? "Name des neuen Unterordners" : "Name des neuen Ordners"}
            initial=""
            onCancel={context.cancel}
            onSubmit={async (name) => {
              const result = await api<MediaFolder>("/media/folders", { method: "POST", body: { name, parentId } });
              await context.finish(parentId, result);
            }}
          />
          {parentId === null && context.error?.folderId === null && (
            <div className="px-2">
              <ErrorText error={context.error.error} />
            </div>
          )}
        </li>
      )}
      {children.map((folder) => (
        <FolderItem key={folder.id} folder={folder} context={context} />
      ))}
    </ul>
  );
}

function FolderItem({ folder, context }: { folder: MediaFolder; context: Context }) {
  const active = folder.id === context.currentId;
  const renaming = context.editing?.folderId === folder.id && context.editing.mode === "rename";
  const menuButton = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const drop = context.dropZone(folder.id);
  const open = context.isOpen(folder.id);
  const creating = context.editing?.folderId === folder.id && context.editing.mode === "create";

  return (
    <li>
      {renaming ? (
        <FolderNameInput
          label="Neuer Name"
          initial={folder.name}
          onCancel={context.cancel}
          onSubmit={async (name) => {
            if (name === folder.name) return context.cancel();
            const result = await api<MediaFolder>(`/media/folders/${folder.id}`, {
              method: "PATCH",
              body: { name, updatedAt: folder.updatedAt },
            });
            await context.finish(folder.id, result);
          }}
        />
      ) : (
        <div
          ref={row}
          {...drop.props}
          className={`group flex items-center rounded ${drop.highlighted ? "bg-zinc-100 ring-2 ring-zinc-500" : active ? "bg-zinc-200 font-medium" : "hover:bg-zinc-100"} ${context.dragging === folder.id || context.cut === folder.id ? "opacity-50" : ""}`}
          onContextMenu={(e) => {
            e.preventDefault();
            context.openMenu(folder, e.clientX, e.clientY);
          }}
        >
          {folder.folderCount > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`Unterordner von ${folder.name} ${open ? "ausblenden" : "anzeigen"}`}
              onClick={() => context.toggle(folder.id)}
              className="w-5 shrink-0 self-stretch rounded text-xs text-zinc-500 hover:bg-zinc-300 hover:text-zinc-900"
            >
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden />
          )}
          <span
            draggable
            aria-hidden
            title="Zum Verschieben ziehen"
            data-drag-handle
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // Firefox beginnt das Ziehen nur mit Daten.
              e.dataTransfer.setData("text/plain", folder.name);
              // Als Vorschau die ganze Zeile, nicht nur den Griff.
              if (row.current) {
                const rect = row.current.getBoundingClientRect();
                e.dataTransfer.setDragImage(row.current, e.clientX - rect.left, e.clientY - rect.top);
              }
              context.startDrag(folder.id);
            }}
            onDragEnd={context.endDrag}
            className="flex shrink-0 cursor-grab self-stretch items-center px-1 active:cursor-grabbing"
          >
            <svg viewBox="0 0 8 14" className="h-3.5 w-2 fill-zinc-400 opacity-0 group-hover:opacity-100">
              {[1, 5, 9, 13].flatMap((y) => [1.5, 6.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y - 0.5} r={1.1} />))}
            </svg>
          </span>
          <div
            role="button"
            tabIndex={0}
            onClick={() => context.onOpen(folder.id)}
            onKeyDown={(e) => {
              if (context.shortcut(folder, e)) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                context.onOpen(folder.id);
              }
            }}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-1 pr-2 text-left text-sm select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {folder.mediaCount > 0 && <span className="text-xs text-zinc-500">{folder.mediaCount}</span>}
          </div>
          <button
            ref={menuButton}
            type="button"
            aria-label={`Aktionen für ${folder.name}`}
            aria-haspopup="menu"
            className="rounded px-1 text-zinc-500 opacity-0 hover:bg-zinc-300 hover:text-zinc-900 focus:opacity-100 group-hover:opacity-100"
            onClick={() => {
              const rect = menuButton.current!.getBoundingClientRect();
              context.openMenu(folder, rect.left, rect.bottom);
            }}
          >
            ⋯
          </button>
        </div>
      )}
      {context.error?.folderId === folder.id && (
        <div className="px-2">
          <ErrorText error={context.error.error} />
        </div>
      )}
      {(open || creating) && <Branch parentId={folder.id} context={context} />}
    </li>
  );
}

function FolderNameInput(props: { label: string; initial: string; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  return (
    <div className="py-0.5">
      <InlineEdit {...props} placeholder="Ordnername" required />
    </div>
  );
}

type MenuItem = {
  action: Action;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
};

function ContextMenu({
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
