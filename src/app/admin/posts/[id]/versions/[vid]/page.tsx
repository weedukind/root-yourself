import type { Metadata } from "next";
import { VersionEditor } from "@/app/admin/editor/version-editor";

export const metadata: Metadata = { title: "Version bearbeiten · Admin" };

export default async function VersionPage({ params }: PageProps<"/admin/posts/[id]/versions/[vid]">) {
  const { id, vid } = await params;
  // key: Beim Wechsel auf eine andere Version (z. B. nach einem Auto-Fork) frisch starten.
  return <VersionEditor key={vid} postId={id} versionId={vid} />;
}
