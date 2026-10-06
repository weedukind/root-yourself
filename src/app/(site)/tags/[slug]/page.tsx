import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { MoreTeasers } from "@/components/more-teasers";
import { TeaserCard } from "@/components/teaser-card";
import { db } from "@/db";
import { getStorage } from "@/server/media/storage";
import { decodeCursor, findTag, listTeasers } from "@/server/public/feed";

// Vorerst bei jeder Anfrage frisch gerendert; Cache und Invalidierung folgen in Schritt 5c.
const lookupTag = cache(async (slug: string) => {
  await connection();
  return findTag(db, slug);
});

export async function generateMetadata({ params }: PageProps<"/tags/[slug]">): Promise<Metadata> {
  const tag = await lookupTag((await params).slug);
  return tag ? { title: `${tag.name} · rootyourself` } : {};
}

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[slug]">) {
  const tag = await lookupTag((await params).slug);
  if (!tag) notFound();

  // ?after=… ist der Weg ohne JavaScript; ein ungültiger Cursor zeigt einfach die erste Seite.
  const after = (await searchParams).after;
  const cursor = typeof after === "string" ? (decodeCursor(after) ?? undefined) : undefined;
  const page = await listTeasers(db, getStorage(), { after: cursor, tagId: tag.id });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">
        <span className="font-normal text-zinc-500">Tag: </span>
        {tag.name}
      </h1>
      {page.teasers.length === 0 ? (
        <p className="text-zinc-500">
          {cursor ? "Keine weiteren Posts." : "Noch keine veröffentlichten Posts mit diesem Tag."}
        </p>
      ) : (
        <>
          {page.teasers.map((teaser) => (
            <TeaserCard key={teaser.slug} teaser={teaser} />
          ))}
          <MoreTeasers endpoint={`/api/tags/${tag.slug}/posts`} initialCursor={page.nextCursor} />
        </>
      )}
    </div>
  );
}
