import type { Metadata } from "next";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Mediathek · Admin" };

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const { folder } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mediathek</h1>
      <MediaLibrary initialFolderId={typeof folder === "string" ? folder : null} />
    </div>
  );
}
