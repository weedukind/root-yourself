"use client";

import { useRef } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { MediaFolder } from "@/shared/api/media";
import { api } from "@/app/admin/api-client";
import { InlineEdit } from "@/app/admin/inline-edit";
import { childrenOf } from "@/app/admin/media-folders";
import { ErrorText } from "@/app/admin/ui";

// Zeilen des Ordnerbaums; Zustand und Aktionen kommen über TreeContext aus FolderTree.

// folderId null mit "create": neuer Ordner auf der obersten Ebene.
export type Editing = { folderId: string | null; mode: "rename" | "create" };

export type TreeContext = {
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

export function Branch({ parentId, context }: { parentId: string | null; context: TreeContext }) {
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

function FolderItem({ folder, context }: { folder: MediaFolder; context: TreeContext }) {
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
