import type { ViewProps } from "../types";
import { SlideShow } from "./show";

// Wie auf der Website, die Kinder im Show-Modus; bearbeitet werden sie im Edit-Modus der Slide.
export function SlideView({ element }: ViewProps<"slide">) {
  if (element.children.length === 0) return <p className="text-sm text-zinc-500 italic">Leere Slide</p>;
  return <SlideShow element={element} />;
}
