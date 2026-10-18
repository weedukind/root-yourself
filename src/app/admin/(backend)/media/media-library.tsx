"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { Media, MediaFolder, MediaWithUsage } from "@/shared/api/media";
import type { TagWithUsage } from "@/shared/api/tags";
import { api } from "@/app/admin/api-client";
import { pathOf } from "@/app/admin/media-folders";
import { ErrorText, iconButton, inputClass } from "@/app/admin/ui";
import { type Clipboard, FolderTree } from "./folder-tree";
import { CUT_ICON, DELETE_ICON, Icon } from "@/app/admin/icons";
import { MediaCard } from "./media-card";
import { Uploader } from "./uploader";

const countLabel = (n: number) => (n === 1 ? "1 Bild" : `${n} Bilder`);

export function MediaLibrary({ initialFolderId }: { initialFolderId: string | null }) {
  const [folders, setFolders] = useState<MediaFolder[] | null>(null);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [items, setItems] = useState<MediaWithUsage[] | null>(null);
  const [allTags, setAllTags] = useState<TagWithUsage[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  // Angehakte Bilder; Löschen und Ausschneiden wirken auf sie.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // Ohne Ordner zeigt die oberste Ebene nur Ordner – außer bei einem Tag-Filter: dann alle Treffer.
  const showImages = folderId !== null || filterTag !== "";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (folderId) params.set("folder", folderId);
    if (filterTag) params.set("tag", filterTag);
    const [foldersResult, mediaResult, tagsResult] = await Promise.all([
      api<MediaFolder[]>("/media/folders"),
      showImages ? api<MediaWithUsage[]>(`/media?${params}`) : Promise.resolve(null),
      api<TagWithUsage[]>("/tags"),
    ]);
    if (tagsResult.ok) setAllTags(tagsResult.value);
    if (!foldersResult.ok) return setLoadError(foldersResult.error);
    setFolders(foldersResult.value);
    if (mediaResult && !mediaResult.ok) return setLoadError(mediaResult.error);
    const list = mediaResult ? mediaResult.value : [];
    setItems(list);
    // Was nicht mehr in der Liste steht (gelöscht, verschoben), ist auch nicht mehr ausgewählt.
    setSelected((current) => new Set(list.filter((m) => current.has(m.id)).map((m) => m.id)));
    setLoadError(null);
  }, [folderId, filterTag, showImages]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Inhalt laden, auch nach Ordner- oder Filterwechsel
    void load();
  }, [load]);

  function open(id: string | null) {
    setFolderId(id);
    setItems(null);
    setSelected(new Set());
    setActionError(null);
    // Den Ordner in der Adresse merken, damit Neuladen und Zurück-Links dort landen.
    window.history.replaceState(null, "", id ? `?folder=${id}` : window.location.pathname);
  }

  const current = folders?.find((f) => f.id === folderId) ?? null;
  // Ein gelöschter oder unbekannter Ordner aus der Adresse: zurück nach oben.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auf die oberste Ebene ausweichen
    if (folders && folderId && !current) open(null);
  }, [folders, folderId, current]);

  const selectedItems = items?.filter((m) => selected.has(m.id)) ?? [];
  const selectedInUse = selectedItems.some((m) => m.versionCount > 0);
  const cutIds = new Set(clipboard?.kind === "media" ? clipboard.items.map((m) => m.id) : []);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cutSelected() {
    setClipboard({
      kind: "media",
      items: selectedItems.map(({ id, folderId, updatedAt }) => ({ id, folderId, updatedAt })),
    });
    setSelected(new Set());
    setActionError(null);
  }

  async function deleteSelected() {
    if (!window.confirm(`${countLabel(selectedItems.length)} endgültig löschen?`)) return;
    setBusy(true);
    const results = await Promise.all(selectedItems.map((m) => api<null>(`/media/${m.id}`, { method: "DELETE" })));
    setBusy(false);
    setActionError(results.find((r) => !r.ok)?.error ?? null);
    await load();
  }

  async function pasteMedia(targetId: string): Promise<ApiError | null> {
    if (clipboard?.kind !== "media") return null;
    const moving = clipboard.items.filter((m) => m.folderId !== targetId);
    const results = await Promise.all(
      moving.map((m) =>
        api<Media>(`/media/${m.id}`, { method: "PATCH", body: { folderId: targetId, updatedAt: m.updatedAt } }),
      ),
    );
    await load();
    return results.find((r) => !r.ok)?.error ?? null;
  }

  if (!folders) return loadError ? <ErrorText error={loadError} /> : <p className="text-sm text-zinc-500">Lädt …</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Ordner" className="space-y-2 md:border-r md:border-zinc-200 md:pr-4">
        <FolderTree
          folders={folders}
          currentId={folderId}
          onOpen={open}
          onChanged={load}
          clipboard={clipboard}
          onClipboard={setClipboard}
          onPasteMedia={pasteMedia}
        />
      </nav>

      <div className="min-w-0 space-y-6">
        <Breadcrumb folders={folders} currentId={folderId} onOpen={open} />

        {!current && (
          <p className="text-sm text-zinc-500">
            Bilder liegen immer in einem Ordner. Zum Hochladen links einen Ordner öffnen oder mit „+“ einen anlegen.
          </p>
        )}
        {(current || showImages) && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {current && <Uploader key={current.id} folder={current} onUploaded={load} />}
              {showImages && (
                <>
                  <button
                    type="button"
                    className={iconButton}
                    aria-label="Ausgewählte Bilder ausschneiden"
                    title="Ausschneiden – danach im Ordnerbaum per Rechtsklick „Einfügen“"
                    disabled={selectedItems.length === 0 || busy}
                    onClick={cutSelected}
                  >
                    <Icon d={CUT_ICON} />
                  </button>
                  <button
                    type="button"
                    className={`${iconButton} hover:text-red-600 disabled:hover:text-zinc-700`}
                    aria-label="Ausgewählte Bilder löschen"
                    title={selectedInUse ? "Verwendete Bilder können nicht gelöscht werden" : "Löschen"}
                    disabled={selectedItems.length === 0 || selectedInUse || busy}
                    onClick={deleteSelected}
                  >
                    <Icon d={DELETE_ICON} />
                  </button>
                  {items && items.length > 0 && (
                    <label className="ml-2 flex items-center gap-1.5 text-sm text-zinc-600">
                      <input
                        type="checkbox"
                        checked={selectedItems.length === items.length}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedItems.length > 0 && selectedItems.length < items.length;
                        }}
                        onChange={(e) => setSelected(new Set(e.target.checked ? items.map((m) => m.id) : []))}
                      />
                      {selectedItems.length > 0 ? `${countLabel(selectedItems.length)} ausgewählt` : "Alle auswählen"}
                    </label>
                  )}
                </>
              )}
            </div>
            {clipboard?.kind === "media" && (
              <p className="text-sm text-zinc-600">
                {countLabel(clipboard.items.length)} ausgeschnitten – im Ordnerbaum per Rechtsklick „Einfügen“.{" "}
                <button type="button" className="underline hover:text-zinc-900" onClick={() => setClipboard(null)}>
                  Aufheben
                </button>
              </p>
            )}
            <ErrorText error={actionError} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="filter-tag" className="text-sm font-medium">
            Filter
          </label>
          <select id="filter-tag" className={inputClass} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="">{current ? "Alle Bilder in diesem Ordner" : "Kein Tag-Filter"}</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name} ({tag.mediaCount})
              </option>
            ))}
          </select>
          {!current && filterTag && <span className="text-xs text-zinc-500">sucht in allen Ordnern</span>}
        </div>
        <ErrorText error={loadError} />

        {showImages &&
          (items === null ? (
            !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {filterTag ? "Keine Bilder mit diesem Tag." : "In diesem Ordner liegen noch keine Bilder."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  folders={folders}
                  showFolder={!current}
                  allTags={allTags}
                  selected={selected.has(item.id)}
                  cut={cutIds.has(item.id)}
                  onToggle={() => toggleSelected(item.id)}
                  onChanged={load}
                />
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function Breadcrumb({
  folders,
  currentId,
  onOpen,
}: {
  folders: MediaFolder[];
  currentId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const path = pathOf(folders, currentId);
  return (
    <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" className="text-zinc-600 underline hover:text-zinc-900" onClick={() => onOpen(null)}>
        Mediathek
      </button>
      {path.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span className="text-zinc-400">/</span>
          {i === path.length - 1 ? (
            <span className="font-semibold">{folder.name}</span>
          ) : (
            <button type="button" className="text-zinc-600 underline hover:text-zinc-900" onClick={() => onOpen(folder.id)}>
              {folder.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

