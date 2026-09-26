import type { TagRef } from "@/shared/api/tags";
import type { RowView } from "@/shared/api/versions";
import { PostContent } from "./post-content";

// Ein Post mit Titel, Datum, Tags und Inhalt – öffentliche Seite und Vorschau.

const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

export type PostArticleProps = {
  title: string;
  /** Erste Veröffentlichung des Posts; null in der Vorschau eines nie veröffentlichten Posts. */
  firstPublishedAt: string | null;
  /** Veröffentlichung der gezeigten Version; „Aktualisiert am“, wenn später als die erste. */
  publishedAt: string | null;
  tags: TagRef[];
  rows: RowView[];
};

export function PostArticle({ title, firstPublishedAt, publishedAt, tags, rows }: PostArticleProps) {
  const updated = firstPublishedAt && publishedAt && publishedAt > firstPublishedAt ? publishedAt : null;
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        {firstPublishedAt && (
          <p className="text-sm text-zinc-500">
            Veröffentlicht am <time dateTime={firstPublishedAt}>{date.format(new Date(firstPublishedAt))}</time>
            {updated && (
              <>
                {" · "}Aktualisiert am <time dateTime={updated}>{date.format(new Date(updated))}</time>
              </>
            )}
          </p>
        )}
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.id} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </header>
      <PostContent rows={rows} />
    </article>
  );
}
