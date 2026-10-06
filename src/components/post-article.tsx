import type { TagRef } from "@/shared/api/tags";
import type { RowView } from "@/shared/api/versions";
import { formatDate } from "@/lib/format";
import { PostContent } from "./post-content";
import { TagList } from "./tag-list";

// Ein Post mit Titel, Datum, Tags und Inhalt – öffentliche Seite und Vorschau.

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
            Veröffentlicht am <time dateTime={firstPublishedAt}>{formatDate(firstPublishedAt)}</time>
            {updated && (
              <>
                {" · "}Aktualisiert am <time dateTime={updated}>{formatDate(updated)}</time>
              </>
            )}
          </p>
        )}
        <TagList tags={tags} />
      </header>
      <PostContent rows={rows} />
    </article>
  );
}
