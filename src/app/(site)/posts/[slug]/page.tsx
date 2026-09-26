import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { PostContent } from "@/components/post-content";
import { db } from "@/db";
import { getStorage } from "@/server/media/storage";
import { findPublishedPost } from "@/server/public/posts";

// Vorerst bei jeder Anfrage frisch gerendert; Cache und Invalidierung folgen in Schritt 5.
const lookup = cache(async (slug: string) => {
  await connection();
  return findPublishedPost(db, getStorage(), slug);
});

const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const result = await lookup((await params).slug);
  return result.kind === "post" ? { title: `${result.post.title} · rootyourself` } : {};
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const result = await lookup((await params).slug);
  if (result.kind === "redirect") permanentRedirect(`/posts/${result.slug}`);
  if (result.kind === "missing") notFound();

  const { post } = result;
  const updated = post.publishedAt && post.publishedAt > post.firstPublishedAt ? post.publishedAt : null;
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">{post.title}</h1>
        <p className="text-sm text-zinc-500">
          Veröffentlicht am <time dateTime={post.firstPublishedAt}>{date.format(new Date(post.firstPublishedAt))}</time>
          {updated && (
            <>
              {" · "}Aktualisiert am <time dateTime={updated}>{date.format(new Date(updated))}</time>
            </>
          )}
        </p>
        {post.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag.id} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </header>
      <PostContent rows={post.rows} />
    </article>
  );
}
