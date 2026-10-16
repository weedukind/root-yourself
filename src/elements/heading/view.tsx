import type { ShowProps } from "../types";
import { HeadingShow } from "./show";

// Vorerst wie auf der Website.
export function HeadingView({ element }: ShowProps<"heading">) {
  return <HeadingShow element={element} />;
}
