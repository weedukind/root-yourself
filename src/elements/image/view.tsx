import type { ShowProps } from "../types";

// Im Editor nur eine Vorschau: höchstens 300 × 300 px, Seitenverhältnis bleibt.
export function ImageView({ element }: ShowProps<"image">) {
  return (
    <figure className="my-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- Admin-Vorschau direkt aus dem Speicher */}
      <img
        src={element.media.url}
        alt={element.media.alt}
        width={element.media.width}
        height={element.media.height}
        loading="lazy"
        className="my-0 h-auto max-h-[300px] w-auto max-w-[300px] object-contain"
      />
      {element.data.caption && <figcaption>{element.data.caption}</figcaption>}
    </figure>
  );
}
