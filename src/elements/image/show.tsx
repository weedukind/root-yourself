import type { ShowProps } from "../types";

export function ImageShow({ element }: ShowProps<"image">) {
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
