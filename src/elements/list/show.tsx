import { ShowElement } from "../components";
import type { ShowProps } from "../types";

export function ListShow({ element }: ShowProps<"list">) {
  if (element.children.length === 0) return null;
  return (
    <div>
      {element.children.map((child, i) => (
        <ShowElement key={i} element={child} />
      ))}
    </div>
  );
}
