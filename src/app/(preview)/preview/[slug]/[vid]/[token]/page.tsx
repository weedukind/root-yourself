import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { PostArticle } from "@/components/post-article";
import { SiteFrame } from "@/components/site-frame";
import { db } from "@/db";
import { formatLongDateTime } from "@/lib/format";
import { getStorage } from "@/server/media/storage";
import { findPreview } from "@/server/public/preview";

// Vorschau über signierte Links – ohne Anmeldung, aber nur mit gültigem Token für genau diese
// Version und nur bis zum Ablauf (src/server/preview-token.ts).

export const metadata: Metadata = {
  title: "Vorschau · rootyourself",
  robots: { index: false, follow: false },
  // Kein Referrer: Klickt jemand in der Vorschau einen externen Link, erfährt die Zielseite den
  // Token nicht.
  referrer: "no-referrer",
};

export default async function PreviewPage({ params }: PageProps<"/preview/[slug]/[vid]/[token]">) {
  await connection();
  const { slug, vid, token } = await params;
  const result = await findPreview(db, getStorage(), slug, vid, token);
  if (result.kind === "redirect") redirect(result.path);
  if (result.kind === "missing") notFound();

  const { version, expiresAt } = result;
  const banner = (
    <div className="bg-amber-100 text-sm text-amber-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <strong>Vorschau · Version {version.number}</strong>
        <span>{version.isPublished ? "entspricht der veröffentlichten Seite" : "noch nicht veröffentlicht"}</span>
        <span className="ml-auto">Link gültig bis {formatLongDateTime(expiresAt)}</span>
      </div>
    </div>
  );

  return (
    <SiteFrame banner={banner}>
      <PostArticle
        title={version.title}
        // Datum wie nach dem Veröffentlichen: erste Veröffentlichung des Posts, sonst keins.
        firstPublishedAt={version.postFirstPublishedAt}
        publishedAt={version.isPublished ? version.publishedAt : null}
        tags={version.tags}
        rows={version.rows}
      />
    </SiteFrame>
  );
}
