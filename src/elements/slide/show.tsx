import { ShowElement } from "../components";
import type { ShowProps } from "../types";
import { Carousel } from "./carousel";

export function SlideShow({ element }: ShowProps<"slide">) {
  if (element.children.length === 0) return null;
  return (
    <Carousel>
      {element.children.map((child, i) => (
        <ShowElement key={i} element={child} />
      ))}
    </Carousel>
  );
}
