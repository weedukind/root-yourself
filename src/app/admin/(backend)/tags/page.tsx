import type { Metadata } from "next";
import { TagManager } from "./tag-manager";

export const metadata: Metadata = { title: "Tags · Admin" };

export default function TagsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tags</h1>
      <TagManager />
    </div>
  );
}
