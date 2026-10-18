import { Stack } from "../list/stack";
import { viewChildren } from "../list/view";
import type { ViewProps } from "../types";

// Wie auf der Website.
export function PageView({ element, renderChild }: ViewProps<"page">) {
  if (element.children.length === 0) return <p className="text-sm text-zinc-500 italic">Noch keine Elemente.</p>;
  return <Stack orientation={element.data.orientation}>{viewChildren(element.children, renderChild)}</Stack>;
}
