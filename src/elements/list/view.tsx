import { ViewElement } from "../components";
import type { ElementContent } from "../schema";
import type { RenderChild, ViewProps } from "../types";
import { Stack } from "./stack";

/** Kinder eines Containers in der View; ohne renderChild einfach ihre View. */
export const viewChildren = (children: ElementContent[], renderChild?: RenderChild) =>
  children.map((child, i) => (
    <div key={i} className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {renderChild ? renderChild(child, i) : <ViewElement element={child} />}
    </div>
  ));

// Wie auf der Website.
export function ListView({ element, renderChild }: ViewProps<"list">) {
  if (element.children.length === 0) return <p className="text-sm text-zinc-500 italic">Leere Liste</p>;
  return <Stack orientation={element.data.orientation}>{viewChildren(element.children, renderChild)}</Stack>;
}
