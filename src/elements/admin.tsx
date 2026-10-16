"use client";

import { HeadingEdit } from "./heading/edit";
import { HeadingView } from "./heading/view";
import { ImageEdit } from "./image/edit";
import { ImageView } from "./image/view";
import { TextEdit } from "./text/edit";
import { TextView } from "./text/view";
import type { DraftElement, ElementCandidate, ElementType } from "./schema";
import type { EditProps, ShowProps } from "./types";

// View- und Edit-Modus aller Elementtypen für den Editor (siehe schema.ts für neue Typen).

type ElementModule<T extends ElementType> = {
  label: string;
  View: (props: ShowProps<T>) => React.ReactNode;
  Edit: (props: EditProps<T>) => React.ReactNode;
};

const ELEMENTS: { [T in ElementType]: ElementModule<T> } = {
  heading: { label: "Überschrift", View: HeadingView, Edit: HeadingEdit },
  text: { label: "Text", View: TextView, Edit: TextEdit },
  image: { label: "Bild", View: ImageView, Edit: ImageEdit },
};

export const elementLabel = (type: ElementType) => ELEMENTS[type].label;

// Die Tabelle ist pro Typ getypt; hier wird das Element einmal auf seinen Typ eingeengt.
const moduleOf = (element: { type: ElementType }) => ELEMENTS[element.type] as unknown as ElementModule<ElementType>;

export function ViewElement({ element }: { element: DraftElement }) {
  const { View } = moduleOf(element);
  return <View element={element as never} />;
}

export function EditElement({
  element,
  onChange,
}: {
  element: ElementCandidate;
  onChange: (element: ElementCandidate) => void;
}) {
  const { Edit } = moduleOf(element);
  return <Edit element={element as never} onChange={onChange as never} />;
}
