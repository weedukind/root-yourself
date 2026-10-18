import { ShowElement } from "../components";
import type { ShowProps } from "../types";

// Die Seite zeigt ihren Inhaltsbereich, die Liste.
export function PageShow({ element }: ShowProps<"page">) {
  return element.children.map((child, i) => <ShowElement key={i} element={child} />);
}
