import { ViewElement } from "../components";
import type { ShowProps } from "../types";
import { Carousel } from "./carousel";

// Wie auf der Website. data-child-index markiert die Kinder: Ein Doppelklick im Editor öffnet
// das Popup mit genau diesem Kind ausgewählt (auch in verschachtelten Slides).
export function SlideView({ element }: ShowProps<"slide">) {
  if (element.children.length === 0) {
    return <p className="text-sm text-zinc-500 italic">Leere Slide – Doppelklick oder ✎ zum Befüllen</p>;
  }
  return (
    <Carousel>
      {element.children.map((child, i) => (
        <div key={i} data-child-index={i} className="h-full">
          <ViewElement element={child} />
        </div>
      ))}
    </Carousel>
  );
}
