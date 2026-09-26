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
      <SlugSection post={post} onChanged={setPost} onReload={load} />
      <VersionsSection versions={post.versions} />
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

function VersionsSection({ versions }: { versions: VersionSummary[] }) {
  const numberOf = new Map(versions.map((v) => [v.id, v.number]));
  return (
    <Section title="Versionen">
      <ul className="divide-y divide-zinc-100">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="w-8 font-mono text-zinc-500">v{version.number}</span>
            <span className="min-w-0 flex-1">{version.title}</span>
            {version.parentVersionId && (
              <span className="text-xs text-zinc-500">von v{numberOf.get(version.parentVersionId)}</span>
            )}
            {versionState(version)}
            <span className="w-40 text-right text-xs text-zinc-500">geändert {formatDateTime(version.updatedAt)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">Forken, Veröffentlichen und Bearbeiten folgen in den nächsten Schritten.</p>
    </Section>
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
