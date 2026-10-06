import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { Teaser } from "@/shared/api/feed";
import { TagList } from "./tag-list";

// Teaser eines Posts – vom Server gerendert (erste Seite) und im Browser (nachgeladene Seiten).

export function TeaserCard({ teaser }: { teaser: Teaser }) {
  const href = `/posts/${teaser.slug}`;
  return (
    <article className="grid gap-4 border-b border-zinc-200 pb-8 sm:grid-cols-3">
      {teaser.image && (
        <Link href={href} className="block overflow-hidden rounded bg-zinc-100 sm:order-last" tabIndex={-1} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- Bildvarianten folgen in Schritt 5c */}
          <img
            src={teaser.image.url}
            alt=""
            width={teaser.image.width}
            height={teaser.image.height}
            loading="lazy"
            className="aspect-[4/3] h-auto w-full object-cover"
          />
        </Link>
      )}
      <div className={`space-y-2 ${teaser.image ? "sm:col-span-2" : "sm:col-span-3"}`}>
        <h2 className="text-2xl font-bold tracking-tight">
          <Link href={href} className="hover:underline">
            {teaser.title}
          </Link>
        </h2>
        <p className="text-sm text-zinc-500">
          <time dateTime={teaser.firstPublishedAt}>{formatDate(teaser.firstPublishedAt)}</time>
        </p>
        <TagList tags={teaser.tags} />
        {teaser.excerpt && <p className="text-zinc-700">{teaser.excerpt}</p>}
        <Link href={href} className="inline-block text-sm font-medium underline">
          Weiterlesen<span className="sr-only">: {teaser.title}</span>
        </Link>
      </div>
    </article>
  );
}
