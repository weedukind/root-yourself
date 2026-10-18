import type { ShowProps } from "../types";
import { TextShow } from "./show";

// Vorerst wie auf der Website.
export function TextView({ element }: ShowProps<"text">) {
  return <TextShow element={element} />;
}
