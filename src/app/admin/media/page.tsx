import type { Metadata } from "next";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Mediathek · Admin" };

export default function MediaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mediathek</h1>
      <MediaLibrary />
    </div>
  );
}
