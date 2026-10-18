import { ShowElement } from "../components";
import type { ShowProps } from "../types";
import { Stack } from "./stack";

export function ListShow({ element }: ShowProps<"list">) {
  if (element.children.length === 0) return null;
  return (
    <Stack orientation={element.data.orientation}>
      {element.children.map((child, i) => (
        <ShowElement key={i} element={child} />
      ))}
    </Stack>
  );
}
