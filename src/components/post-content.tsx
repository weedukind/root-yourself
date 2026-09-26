import type { CSSProperties } from "react";
import Markdown from "react-markdown";
import type { ElementView, RowView } from "@/shared/api/versions";

// Darstellung des Inhalts einer Version. Gemeinsam für die Vorschau im Editor und die
// öffentliche Seite, damit beide exakt gleich aussehen. Grid-Regeln: .post-row/.post-cell
// in globals.css.

function Element({ element }: { element: ElementView }) {
  switch (element.type) {
    case "heading":
      return element.data.level === 2 ? <h2>{element.data.text}</h2> : <h3>{element.data.text}</h3>;
    case "text":
      // react-markdown rendert kein rohes HTML – eingefügtes <script> o. Ä. erscheint als Text.
      return <Markdown>{element.data.markdown}</Markdown>;
    case "image":
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- Auslieferung der Bilder wird in Schritt 5 festgelegt */}
          <img
            src={element.media.url}
            alt={element.media.alt}
            width={element.media.width}
            height={element.media.height}
            loading="lazy"
            className="h-auto w-full"
          />
          {element.data.caption && <figcaption>{element.data.caption}</figcaption>}
        </figure>
      );
  }
}

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
                <Element key={element.id} element={element} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
