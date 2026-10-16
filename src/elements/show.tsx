import { HeadingShow } from "./heading/show";
import { ImageShow } from "./image/show";
import { TextShow } from "./text/show";
import type { ElementContent } from "./schema";

// Show-Modus aller Elementtypen: öffentliche Seite und Vorschau im Editor.

export function ShowElement({ element }: { element: ElementContent }) {
  switch (element.type) {
    case "heading":
      return <HeadingShow element={element} />;
    case "text":
      return <TextShow element={element} />;
    case "image":
      return <ImageShow element={element} />;
  }
}
