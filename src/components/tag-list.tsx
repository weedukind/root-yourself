import Link from "next/link";
import type { TagRef } from "@/shared/api/tags";

/** Tags als Links auf ihre Tag-Seiten – in Teasern und auf Post-Seiten. */
export function TagList({ tags }: { tags: TagRef[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link href={`/tags/${tag.slug}`} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-200">
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
