"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { PostDetail, PostSummary } from "@/shared/api/posts";
import { api } from "../api-client";
import { Badge, ErrorText, formatDateTime, inputClass, primaryButton } from "../ui";

export function PostList() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const result = await api<PostSummary[]>("/posts");
    if (result.ok) {
      setPosts(result.value);
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
      <CreatePostForm />
      <ErrorText error={loadError} />
      {posts === null ? (
        !loadError && <p className="text-sm text-zinc-500">Lädt …</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Posts.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/admin/posts/${post.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{post.title}</p>
                  <p className="font-mono text-xs text-zinc-500">/posts/{post.slug}</p>
                </div>
                <PostStatus post={post} />
                <p className="w-40 text-right text-xs text-zinc-500">geändert {formatDateTime(post.lastChangedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PostStatus({ post }: { post: PostSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {post.publishedVersion ? (
        <Badge tone="green">veröffentlicht: Version {post.publishedVersion.number}</Badge>
      ) : (
        <Badge tone="zinc">nicht veröffentlicht</Badge>
      )}
      <Badge tone="zinc">
        {post.versionCount} {post.versionCount === 1 ? "Version" : "Versionen"}
      </Badge>
      {post.editableVersionCount > 0 && <Badge tone="amber">{post.editableVersionCount} in Arbeit</Badge>}
    </div>
  );
}

function CreatePostForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api<PostDetail>("/posts", { method: "POST", body: { title } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push(`/admin/posts/${result.value.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor="new-post" className="block text-sm font-medium">
        Neuer Post
      </label>
      <div className="flex gap-2">
        <input
          id="new-post"
          className={`${inputClass} w-96 max-w-full`}
          placeholder="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={error !== null}
        />
        <button type="submit" className={primaryButton} disabled={busy || !title.trim()}>
          Anlegen
        </button>
      </div>
      <p className="text-xs text-zinc-500">Der Slug wird aus dem Titel erzeugt und lässt sich danach ändern.</p>
      <ErrorText error={error} />
    </form>
  );
}
