import { ViewElement } from "../components";
import type { ShowProps } from "../types";

// Wie auf der Website. data-child-index markiert die Kinder für den Doppelklick im Editor
// (siehe slide/view.tsx).
export function ListView({ element }: ShowProps<"list">) {
  if (element.children.length === 0) {
    return <p className="text-sm text-zinc-500 italic">Leere Liste – Doppelklick oder ✎ zum Befüllen</p>;
  }
  return (
    <div>
      {element.children.map((child, i) => (
        <div key={i} data-child-index={i}>
          <ViewElement element={child} />
        </div>
      ))}
    </div>
  );
}
