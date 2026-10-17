"use client";

import { HeadingView } from "./heading/view";
import { ImageView } from "./image/view";
import { TextView } from "./text/view";
import type { DraftElement, ElementType } from "./schema";
import type { ShowProps } from "./types";

// View-Modus aller Elementtypen für den Editor. Den Edit-Modus baut form.tsx aus den Attributen.

const VIEWS: { [T in ElementType]: (props: ShowProps<T>) => React.ReactNode } = {
  heading: HeadingView,
  text: TextView,
  image: ImageView,
};

export function ViewElement({ element }: { element: DraftElement }) {
  // Die Tabelle ist pro Typ getypt; hier wird das Element einmal auf seinen Typ eingeengt.
  const View = VIEWS[element.type] as (props: { element: DraftElement }) => React.ReactNode;
  return <View element={element} />;
}
