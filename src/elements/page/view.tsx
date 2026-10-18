import { ViewElement } from "../components";
import type { ViewProps } from "../types";

// Der Inhaltsbereich, die Liste, in ihrer View; der Editor legt über renderChild einen Rahmen darum.
export function PageView({ element, renderChild }: ViewProps<"page">) {
  return element.children.map((child, i) => (
    <div key={i} className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {renderChild ? renderChild(child, i) : <ViewElement element={child} />}
    </div>
  ));
}
