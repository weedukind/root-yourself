import { ShowElement } from "../components";
import { Stack } from "../list/stack";
import type { ShowProps } from "../types";

export function PageShow({ element }: ShowProps<"page">) {
  return (
    <Stack orientation={element.data.orientation}>
      {element.children.map((child, i) => (
        <ShowElement key={i} element={child} />
      ))}
    </Stack>
  );
}
