import { HeadingShow } from "./heading/show";
import { HeadingView } from "./heading/view";
import { ImageShow } from "./image/show";
import { ImageView } from "./image/view";
import { ListShow } from "./list/show";
import { ListView } from "./list/view";
import { PageShow } from "./page/show";
import { PageView } from "./page/view";
import { SlideShow } from "./slide/show";
import { SlideView } from "./slide/view";
import { TextShow } from "./text/show";
import { TextView } from "./text/view";
import type { ElementContent, ElementType } from "./schema";
import type { RenderChild, ShowProps, ViewProps } from "./types";

// Show- und View-Komponenten aller Elementtypen. Ohne "use client": Show rendert auch auf dem
// Server (öffentliche Seite). Fehlt ein Typ in der Tabelle, meldet TypeScript das.

type Show<T extends ElementType> = (props: ShowProps<T>) => React.ReactNode;
type View<T extends ElementType> = (props: ViewProps<T>) => React.ReactNode;

const ELEMENT_COMPONENTS: { [T in ElementType]: { Show: Show<T>; View: View<T> } } = {
  heading: { Show: HeadingShow, View: HeadingView },
  text: { Show: TextShow, View: TextView },
  image: { Show: ImageShow, View: ImageView },
  list: { Show: ListShow, View: ListView },
  slide: { Show: SlideShow, View: SlideView },
  page: { Show: PageShow, View: PageView },
};

// Die Tabelle ist pro Typ getypt; hier wird das Element einmal auf seinen Typ eingeengt.
const componentsOf = (element: ElementContent) =>
  ELEMENT_COMPONENTS[element.type] as unknown as { Show: Show<ElementType>; View: View<ElementType> };

/** Show-Modus: öffentliche Seite und Vorschau im Editor. */
export function ShowElement({ element }: { element: ElementContent }) {
  const { Show } = componentsOf(element);
  return <Show element={element as never} />;
}

/** View-Modus: das Element im Editor; Rahmen und Knöpfe legt der Editor über renderChild drumherum. */
export function ViewElement({ element, renderChild }: { element: ElementContent; renderChild?: RenderChild }) {
  const { View } = componentsOf(element);
  return <View element={element as never} renderChild={renderChild} />;
}
