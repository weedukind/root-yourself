import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PostArticle } from "@/components/post-article";
import { SiteFrame } from "@/components/site-frame";
import { db } from "@/db";
import { getStorage } from "@/server/media/storage";
import { parseVersionPath } from "@/server/route-params";
import { getVersion } from "@/server/versions/content";

// Vorschau einer beliebigen Version im Rahmen der Website. Liegt unter /admin und ist damit
// per Basic Auth geschützt (proxy.ts); die öffentlichen Seiten bleiben davon unberührt.

export const metadata: Metadata = { title: "Vorschau · rootyourself", robots: { index: false } };

export default async function PreviewPage({ params }: PageProps<"/admin/posts/[id]/versions/[vid]/preview">) {
  await connection();
  const path = parseVersionPath(await params);
  if (!path.ok) notFound();
  const result = await getVersion(db, getStorage(), path.value.postId, path.value.versionId);
  if (!result.ok) notFound();
  const version = result.value;

  const status = version.isPublished
    ? "veröffentlicht – so sieht die Website aus"
    : version.postPublishedVersion
      ? `nicht veröffentlicht – die Website zeigt Version ${version.postPublishedVersion.number}`
      : "nicht veröffentlicht – der Post ist nicht öffentlich";

  const banner = (
    <div className="bg-amber-100 text-sm text-amber-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <strong>Vorschau: Version {version.number}</strong>
        <span>{status}</span>
        <Link href={`/admin/posts/${version.postId}/versions/${version.id}`} className="ml-auto underline">
          Zum Editor
        </Link>
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
