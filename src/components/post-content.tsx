import { ShowElement } from "@/elements/components";
import type { PageView } from "@/shared/api/versions";

// Darstellung des Inhalts einer Version: die Seite und ihr Baum. Gemeinsam für die Vorschau und
// die öffentliche Seite, damit beide exakt gleich aussehen.

export function PostContent({ root }: { root: PageView }) {
  return (
    <div className="prose prose-zinc max-w-none">
      <ShowElement element={root} />
    </div>
  );
}
