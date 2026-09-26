"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { PostDetail, VersionSummary } from "@/shared/api/posts";
import { api } from "../../api-client";
import { Badge, dangerButton, ErrorText, formatDateTime, inputClass, primaryButton, secondaryButton } from "../../ui";
import { PostStatus } from "../post-list";

export function PostEditor({ id }: { id: string }) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const result = await api<PostDetail>(`/posts/${id}`);
    if (result.ok) {
      setPost(result.value);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden des Posts
    void load();
  }, [load]);

  if (!post) {
    return (
      <div className="space-y-4">
        <Link href="/admin/posts" className="text-sm text-zinc-600 underline">
          ← Alle Posts
        </Link>
        {loadError ? <ErrorText error={loadError} /> : <p className="text-sm text-zinc-500">Lädt …</p>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/admin/posts" className="text-sm text-zinc-600 underline">
          ← Alle Posts
        </Link>
        <h1 className="text-2xl font-semibold">{post.title}</h1>
        <PostStatus post={post} />
      </div>
      <PublicationSection post={post} onChanged={setPost} />
      <VersionTree post={post} onChanged={load} />
      <SlugSection post={post} onChanged={setPost} onReload={load} />
      <DeleteSection post={post} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SlugSection({
  post,
  onChanged,
  onReload,
}: {
  post: PostDetail;
  onChanged: (post: PostDetail) => void;
  onReload: () => Promise<void>;
}) {
  const [slug, setSlug] = useState(post.slug);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = slug !== post.slug;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<PostDetail>(`/posts/${post.id}`, {
      method: "PATCH",
      body: { slug, updatedAt: post.updatedAt },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    onChanged(result.value);
  }

  return (
    <Section title="Adresse">
      <form onSubmit={save} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="slug" className="font-mono text-sm text-zinc-500">
            /posts/
          </label>
          <input
            id="slug"
            className={`${inputClass} w-80 max-w-full font-mono`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <button type="submit" className={primaryButton} disabled={busy || !changed}>
            Speichern
          </button>
        </div>
        {changed && (
          <p className="text-sm text-zinc-600">
            {post.firstPublishedAt
              ? `/posts/${post.slug} leitet danach dauerhaft auf die neue Adresse weiter.`
              : "Der Post war noch nie veröffentlicht, daher entsteht keine Weiterleitung."}
          </p>
        )}
        <ErrorText error={error} />
        {error?.code === "stale" && (
          <button type="button" className={secondaryButton} onClick={onReload}>
            Neu laden
          </button>
        )}
      </form>
      {post.redirectSlugs.length > 0 && (
        <div className="text-sm">
          <p className="text-zinc-600">Frühere Adressen, die hierher weiterleiten:</p>
          <ul className="list-inside list-disc font-mono text-xs text-zinc-500">
            {post.redirectSlugs.map((s) => (
              <li key={s}>/posts/{s}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function versionState(version: VersionSummary) {
  if (version.isPublished) return <Badge tone="green">veröffentlicht</Badge>;
  if (version.isEditable) return <Badge tone="amber">bearbeitbar</Badge>;
  return <Badge tone="zinc">eingefroren</Badge>;
}

function PublicationSection({ post, onChanged }: { post: PostDetail; onChanged: (post: PostDetail) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function unpublish() {
    setBusy(true);
    const result = await api<PostDetail>(`/posts/${post.id}/unpublish`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirming(false);
    onChanged(result.value);
  }

  return (
    <Section title="Veröffentlichung">
      {post.publishedVersion ? (
        <p className="text-sm">
          Öffentlich ist <strong>Version {post.publishedVersion.number}</strong>
          {post.publishedVersion.publishedAt && ` seit ${formatDateTime(post.publishedVersion.publishedAt)}`}.
          {post.firstPublishedAt && ` Zuerst veröffentlicht am ${formatDateTime(post.firstPublishedAt)}.`}
        </p>
      ) : (
        <p className="text-sm text-zinc-600">
          Der Post ist nicht öffentlich.
          {post.firstPublishedAt && ` Er war zuerst am ${formatDateTime(post.firstPublishedAt)} veröffentlicht.`} Zum
          Veröffentlichen eine Version im Versionsbaum wählen.
        </p>
      )}
      {post.publishedVersion &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Der Post verschwindet von der Website; alle Versionen bleiben erhalten.</span>
            <button type="button" className={dangerButton} onClick={unpublish} disabled={busy}>
              Zurückziehen
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setConfirming(true)}>
            Veröffentlichung zurückziehen …
          </button>
        ))}
      <ErrorText error={error} />
    </Section>
  );
}

function VersionTree({ post, onChanged }: { post: PostDetail; onChanged: () => Promise<void> }) {
  const children = new Map<string | null, VersionSummary[]>();
  for (const version of post.versions) {
    const key = version.parentVersionId;
    children.set(key, [...(children.get(key) ?? []), version]);
  }

  const renderLevel = (parentId: string | null) => {
    const level = children.get(parentId);
    if (!level) return null;
    return (
      <ul className={parentId ? "ml-4 border-l border-zinc-200 pl-3" : ""}>
        {level.map((version) => (
          <li key={version.id}>
            <VersionNode post={post} version={version} onChanged={onChanged} />
            {renderLevel(version.id)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Section title="Versionen">
      <p className="text-xs text-zinc-500">
        Bearbeitbar sind nur unveröffentlichte Versionen ohne Forks. Um an einer anderen Version weiterzuarbeiten, sie forken.
      </p>
      {renderLevel(null)}
    </Section>
  );
}

function VersionNode({
  post,
  version,
  onChanged,
}: {
  post: PostDetail;
  version: VersionSummary;
  onChanged: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/posts/${post.id}/versions/${version.id}`;
  const canDelete = version.isEditable && post.versionCount > 1;

  async function run(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    const result = await api<unknown>(path, { method });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setConfirmDelete(false);
    await onChanged();
  }

  return (
    <div className="space-y-1 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-zinc-500">v{version.number}</span>
        <span className="min-w-0 flex-1">{version.title}</span>
        {versionState(version)}
        <span className="text-xs text-zinc-500">geändert {formatDateTime(version.updatedAt)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => run(`${base}/fork`, "POST")}>
          Forken
        </button>
        {!version.isPublished && (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => run(`${base}/publish`, "POST")}>
            {post.publishedVersion ? `Statt v${post.publishedVersion.number} veröffentlichen` : "Veröffentlichen"}
          </button>
        )}
        {canDelete &&
          (confirmDelete ? (
            <>
              <button type="button" className={dangerButton} disabled={busy} onClick={() => run(base, "DELETE")}>
                v{version.number} endgültig löschen
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </button>
            </>
          ) : (
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setConfirmDelete(true)}>
              Löschen
            </button>
          ))}
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function DeleteSection({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await api<null>(`/posts/${post.id}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/admin/posts");
  }

  return (
    <Section title="Post löschen">
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            „{post.title}“ mit allen {post.versionCount} {post.versionCount === 1 ? "Version" : "Versionen"} endgültig löschen?
            {post.publishedVersion && " Der Post ist veröffentlicht und verschwindet sofort von der Website."}
            {(post.firstPublishedAt || post.redirectSlugs.length > 0) && " Seine Adressen werden danach nicht mehr erreichbar sein."}
          </p>
          <div className="flex gap-2">
            <button type="button" className={dangerButton} onClick={remove} disabled={busy}>
              Endgültig löschen
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
          <ErrorText error={error} />
        </div>
      ) : (
        <button type="button" className={secondaryButton} onClick={() => setConfirming(true)}>
          Post löschen …
        </button>
      )}
    </Section>
  );
}
