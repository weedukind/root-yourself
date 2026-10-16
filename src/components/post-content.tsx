import type { CSSProperties } from "react";
import { ShowElement } from "@/elements/show";
import type { RowView } from "@/shared/api/versions";

// Darstellung des Inhalts einer Version. Gemeinsam für die Vorschau im Editor und die
// öffentliche Seite, damit beide exakt gleich aussehen. Grid-Regeln: .post-row/.post-cell
// in globals.css.

export function PostContent({ rows }: { rows: RowView[] }) {
  return (
    <div className="space-y-8">
      {rows.map((row) => (
        <div
          key={row.id}
          className="post-row"
          style={{ "--cols": row.gridWidth, "--rows": row.gridHeight } as CSSProperties}
        >
          {row.cells.map((cell) => (
            <div
              key={cell.id}
              className="post-cell prose prose-zinc max-w-none"
              style={{ "--w": cell.width, "--h": cell.height } as CSSProperties}
            >
              {cell.elements.map((element) => (
                <ShowElement key={element.id} element={element} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
