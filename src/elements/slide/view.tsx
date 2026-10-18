import { ViewElement } from "../components";
import type { ViewProps } from "../types";
import { Carousel } from "./carousel";

// Wie auf der Website.
export function SlideView({ element, renderChild }: ViewProps<"slide">) {
  if (element.children.length === 0) return <p className="text-sm text-zinc-500 italic">Leere Slide</p>;
  return (
    <Carousel>
      {element.children.map((child, i) => (
        <div key={i} className="h-full">
          {renderChild ? renderChild(child, i) : <ViewElement element={child} />}
        </div>
      ))}
    </Carousel>
  );
}
