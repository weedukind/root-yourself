import type { ShowProps } from "../types";
import { ImageShow } from "./show";

// Vorerst wie auf der Website.
export function ImageView({ element }: ShowProps<"image">) {
  return <ImageShow element={element} />;
}
