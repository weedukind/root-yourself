"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { Tag, TagWithUsage } from "@/shared/api/tags";
import { api } from "../api-client";
import { dangerButton, ErrorText, inputClass, primaryButton, secondaryButton } from "../ui";

export function TagManager() {
  const [tags, setTags] = useState<TagWithUsage[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const result = await api<TagWithUsage[]>("/tags");
    if (result.ok) {
      setTags(result.value);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden der Liste
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <CreateTagForm onCreated={load} />
      <ErrorText error={loadError} />
      {tags === null ? (
        !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Tags.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {tags.map((tag) => (
            <TagItem key={tag.id} tag={tag} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateTagForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<Tag>("/tags", { method: "POST", body: { name } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setName("");
    setError(null);
    await onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor="new-tag" className="block text-sm font-medium">
        Neuer Tag
      </label>
      <div className="flex gap-2">
        <input
          id="new-tag"
          className={`${inputClass} w-64`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error !== null}
        />
        <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
          Anlegen
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

type Mode = "view" | "edit" | "confirm-delete";

function TagItem({ tag, onChanged }: { tag: TagWithUsage; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState(tag.name);
  const [slug, setSlug] = useState(tag.slug);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setName(tag.name);
    setSlug(tag.slug);
    setError(null);
    setMode("edit");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<Tag>(`/tags/${tag.id}`, {
      method: "PATCH",
      body: {
        name: name !== tag.name ? name : undefined,
        slug: slug !== tag.slug ? slug : undefined,
        updatedAt: tag.updatedAt,
      },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setMode("view");
    await onChanged();
  }

  async function remove() {
    setBusy(true);
    const result = await api<null>(`/tags/${tag.id}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    await onChanged();
  }

  if (mode === "edit") {
    return (
      <li className="p-3">
        <form onSubmit={save} className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block font-medium">Name</span>
              <input className={`${inputClass} w-56`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block font-medium">Slug</span>
              <input className={`${inputClass} w-56 font-mono`} value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
            <button type="submit" className={primaryButton} disabled={busy}>
              Speichern
            </button>
            <button type="button" className={secondaryButton} onClick={() => setMode("view")}>
              Abbrechen
            </button>
          </div>
          {slug !== tag.slug && (
            <p className="text-sm text-amber-700">Achtung: Die bisherige Adresse /tags/{tag.slug} funktioniert danach nicht mehr.</p>
          )}
          <ErrorText error={error} />
          {error?.code === "stale" && (
            <button type="button" className={secondaryButton} onClick={onChanged}>
              Neu laden
            </button>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{tag.name}</p>
        <p className="font-mono text-xs text-zinc-500">/tags/{tag.slug}</p>
      </div>
      <p className="text-sm text-zinc-600">
        {tag.postCount} {tag.postCount === 1 ? "Post" : "Posts"}
        {tag.postCount > 0 && `, ${tag.publishedPostCount} veröffentlicht`}
      </p>
      {mode === "confirm-delete" ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="text-sm">
            „{tag.name}“ löschen?
            {tag.postCount > 0 && ` Der Tag wird aus ${tag.postCount} ${tag.postCount === 1 ? "Post" : "Posts"} entfernt, auch aus älteren Versionen.`}
          </p>
          <button type="button" className={dangerButton} onClick={remove} disabled={busy}>
            Endgültig löschen
          </button>
          <button type="button" className={secondaryButton} onClick={() => setMode("view")}>
            Abbrechen
          </button>
          <ErrorText error={error} />
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} onClick={startEdit}>
            Bearbeiten
          </button>
          <button type="button" className={secondaryButton} onClick={() => setMode("confirm-delete")}>
            Löschen
          </button>
        </div>
      )}
    </li>
  );
}
