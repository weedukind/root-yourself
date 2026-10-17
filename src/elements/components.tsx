import { HeadingShow } from "./heading/show";
import { HeadingView } from "./heading/view";
import { ImageShow } from "./image/show";
import { ImageView } from "./image/view";
import { TextShow } from "./text/show";
import { TextView } from "./text/view";
import type { ElementContent, ElementType } from "./schema";
import type { ShowProps } from "./types";

// Show- und View-Komponenten aller Elementtypen. Ohne "use client": Show rendert auch auf dem
// Server (öffentliche Seite). Fehlt ein Typ in der Tabelle, meldet TypeScript das.

type Component<T extends ElementType> = (props: ShowProps<T>) => React.ReactNode;

const ELEMENT_COMPONENTS: { [T in ElementType]: { Show: Component<T>; View: Component<T> } } = {
  heading: { Show: HeadingShow, View: HeadingView },
  text: { Show: TextShow, View: TextView },
  image: { Show: ImageShow, View: ImageView },
};

// Die Tabelle ist pro Typ getypt; hier wird das Element einmal auf seinen Typ eingeengt.
const componentsOf = (element: ElementContent) =>
  ELEMENT_COMPONENTS[element.type] as unknown as { Show: Component<ElementType>; View: Component<ElementType> };

/** Show-Modus: öffentliche Seite und Vorschau im Editor. */
export function ShowElement({ element }: { element: ElementContent }) {
  const { Show } = componentsOf(element);
  return <Show element={element as never} />;
}

/** View-Modus: das Element im Editor; die Steuerelemente legt der Editor drumherum. */
export function ViewElement({ element }: { element: ElementContent }) {
  const { View } = componentsOf(element);
  return <View element={element as never} />;
}
