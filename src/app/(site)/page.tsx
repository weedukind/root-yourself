import type { Metadata } from "next";
import { connection } from "next/server";
import { MoreTeasers } from "@/components/more-teasers";
import { TeaserCard } from "@/components/teaser-card";
import { db } from "@/db";
import { getStorage } from "@/server/media/storage";
import { decodeCursor, listTeasers } from "@/server/public/feed";

export const metadata: Metadata = { title: "rootyourself" };

// Vorerst bei jeder Anfrage frisch gerendert; Cache und Invalidierung folgen in Schritt 5c.
export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  // ?after=… ist der Weg ohne JavaScript; ein ungültiger Cursor zeigt einfach die erste Seite.
  const after = (await searchParams).after;
  const cursor = typeof after === "string" ? (decodeCursor(after) ?? undefined) : undefined;
  const page = await listTeasers(db, getStorage(), { after: cursor });

  if (page.teasers.length === 0) {
    return <p className="text-zinc-500">{cursor ? "Keine weiteren Posts." : "Noch keine Posts veröffentlicht."}</p>;
  }

  return (
    <div className="space-y-8">
      {page.teasers.map((teaser) => (
        <TeaserCard key={teaser.slug} teaser={teaser} />
      ))}
      <MoreTeasers endpoint="/api/posts" initialCursor={page.nextCursor} />
    </div>
  );
}
