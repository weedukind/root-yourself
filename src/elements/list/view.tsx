import type { ViewProps } from "../types";
import { ListShow } from "./show";

// Wie auf der Website, die Kinder im Show-Modus; bearbeitet werden sie im Edit-Modus der Liste.
export function ListView({ element }: ViewProps<"list">) {
  if (element.children.length === 0) return <p className="text-sm text-zinc-500 italic">Leere Liste</p>;
  return <ListShow element={element} />;
}
