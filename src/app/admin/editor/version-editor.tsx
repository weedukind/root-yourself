"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PostContent } from "@/components/post-content";
import type { ApiError } from "@/shared/api/errors";
import type { VersionSummary } from "@/shared/api/posts";
import type { TagWithUsage } from "@/shared/api/tags";
import type { SaveVersionResult, VersionDetail } from "@/shared/api/versions";
import { api } from "../api-client";
import { Badge, ErrorText, inputClass, primaryButton, PublicPostLink, secondaryButton } from "../ui";
import { type Draft, fingerprint, fromVersion, toInput, toRowViews } from "./draft";
import { LayoutEditor } from "./layout-editor";

type Loaded = { version: VersionDetail; draft: Draft; baseline: string };

export function VersionEditor({ postId, versionId }: { postId: string; versionId: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [allTags, setAllTags] = useState<TagWithUsage[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [versionResult, tagsResult] = await Promise.all([
      api<VersionDetail>(`/posts/${postId}/versions/${versionId}`),
      api<TagWithUsage[]>("/tags"),
    ]);
    if (tagsResult.ok) setAllTags(tagsResult.value);
    if (!versionResult.ok) return setError(versionResult.error);
    const draft = fromVersion(versionResult.value);
    setLoaded({ version: versionResult.value, draft, baseline: fingerprint(draft) });
    setError(null);
  }, [postId, versionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden der Version
    void load();
  }, [load]);

  const dirty = loaded !== null && fingerprint(loaded.draft) !== loaded.baseline;

  // Warnung beim Verlassen mit ungespeicherten Änderungen.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = useCallback((change: (draft: Draft) => Draft) => {
    setLoaded((current) => current && { ...current, draft: change(current.draft) });
  }, []);

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Link href={`/admin/posts/${postId}`} className="text-sm text-zinc-600 underline">
          ← Zum Post
        </Link>
        {error ? <ErrorText error={error} /> : <p className="text-sm text-zinc-500">Lädt …</p>}
      </div>
    );
  }

  const { version, draft } = loaded;
  const frozen = !version.isEditable && !version.isPublished;

  async function save() {
    setBusy(true);
    const result = await api<SaveVersionResult>(`/posts/${postId}/versions/${versionId}`, {
      method: "PUT",
      body: toInput(draft, version.updatedAt),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    if (result.value.forkedFrom) {
      // Veröffentlichte Version bearbeitet: Weiter in der neuen Version.
      window.sessionStorage.setItem("editor-notice", `Gespeichert als neue Version ${result.value.version.number}. Die veröffentlichte Version ist unverändert.`);
      router.replace(`/admin/posts/${postId}/versions/${result.value.version.id}`);
      return;
    }
    const saved = fromVersion(result.value.version);
    setLoaded({ version: result.value.version, draft: saved, baseline: fingerprint(saved) });
    setNotice("Gespeichert.");
  }

  async function forkAndEdit() {
    setBusy(true);
    const result = await api<VersionSummary>(`/posts/${postId}/versions/${versionId}/fork`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push(`/admin/posts/${postId}/versions/${result.value.id}`);
  }

  function toggleTag(id: string) {
    update((d) => ({ ...d, tagIds: d.tagIds.includes(id) ? d.tagIds.filter((t) => t !== id) : [...d.tagIds, id] }));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`/admin/posts/${postId}`} className="text-sm text-zinc-600 underline">
          ← Zum Post
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Version {version.number}</h1>
          {version.isPublished ? (
            <>
              <Badge tone="green">veröffentlicht</Badge>
              <PublicPostLink slug={version.postSlug} />
            </>
          ) : version.isEditable ? (
            <Badge tone="amber">bearbeitbar</Badge>
          ) : (
            <Badge tone="zinc">eingefroren</Badge>
          )}
          {dirty && <Badge tone="amber">ungespeicherte Änderungen</Badge>}
        </div>
        <SavedNotice notice={notice} onClear={() => setNotice(null)} />
        {version.isPublished && (
          <p className="rounded bg-green-50 p-2 text-sm text-green-900">
            Diese Version ist veröffentlicht und bleibt unverändert. Beim Speichern entsteht eine neue Version mit deinen
            Änderungen.
          </p>
        )}
        {frozen && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-zinc-100 p-2 text-sm">
            <span>Diese Version hat Forks und ist eingefroren.</span>
            <button type="button" className={primaryButton} onClick={forkAndEdit} disabled={busy}>
              Forken und bearbeiten
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded border border-zinc-200 bg-white p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Titel</span>
          <input
            className={`${inputClass} w-full text-lg`}
            value={draft.title}
            readOnly={frozen}
            onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Tags</legend>
          {allTags.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Noch keine Tags – <Link href="/admin/tags" className="underline">anlegen</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {allTags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={draft.tagIds.includes(tag.id)} disabled={frozen} onChange={() => toggleTag(tag.id)} />
                  {tag.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>

      <div className="flex items-center gap-2" role="tablist">
        {(["edit", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? primaryButton : secondaryButton}
            onClick={() => setMode(m)}
          >
            {m === "edit" ? "Layout & Inhalt" : "Vorschau"}
          </button>
        ))}
      </div>

      {mode === "edit" ? (
        <LayoutEditor draft={draft} update={update} readOnly={frozen} />
      ) : (
        <article className="rounded border border-zinc-200 bg-white p-6">
          <h1 className="mb-6 text-3xl font-bold">{draft.title}</h1>
          <PostContent rows={toRowViews(draft)} />
        </article>
      )}

      {!frozen && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50/95 py-3">
          <button type="button" className={primaryButton} onClick={save} disabled={busy || !dirty}>
            {version.isPublished ? "Als neue Version speichern" : "Speichern"}
          </button>
          {dirty && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => update(() => fromVersion(version))}
              disabled={busy}
            >
              Änderungen verwerfen
            </button>
          )}
          <ErrorText error={error} />
          {error?.code === "version_conflict" && (
            <span className="text-sm text-zinc-600">
              Neu laden verwirft deine Änderungen.{" "}
              <button type="button" className="underline" onClick={load}>
                Neu laden
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Meldung nach dem Speichern; nach einem Auto-Fork kommt sie über die Navigation hinweg an. */
function SavedNotice({ notice, onClear }: { notice: string | null; onClear: () => void }) {
  const [carried, setCarried] = useState<string | null>(null);
  useEffect(() => {
    const message = window.sessionStorage.getItem("editor-notice");
    if (!message) return;
    window.sessionStorage.removeItem("editor-notice");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Meldung aus der vorigen Seite übernehmen
    setCarried(message);
  }, []);
  const text = notice ?? carried;
  if (!text) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-green-800">
      {text}
      <button
        type="button"
        className="text-xs underline"
        onClick={() => {
          setCarried(null);
          onClear();
        }}
      >
        ausblenden
      </button>
    </p>
  );
}
