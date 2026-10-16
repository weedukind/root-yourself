"use client";

import type { DraftElement } from "@/app/admin/editor/draft";
import { HeadingEdit } from "./heading/edit";
import { HeadingView } from "./heading/view";
import { ImageEdit } from "./image/edit";
import { ImageView } from "./image/view";
import { TextEdit } from "./text/edit";
import { TextView } from "./text/view";
import type { DraftOf, EditProps, ElementType, ShowProps } from "./types";

// View- und Edit-Modus aller Elementtypen für den Editor. Ein neuer Elementtyp bekommt einen
// Ordner mit show.tsx, view.tsx und edit.tsx und einen Eintrag hier und in show.tsx.

type ElementModule<T extends ElementType> = {
  label: string;
  /** Warum das Element so noch nicht übernommen werden kann; null: in Ordnung. */
  problem: (element: DraftOf<T>) => string | null;
  View: (props: ShowProps<T>) => React.ReactNode;
  Edit: (props: EditProps<T>) => React.ReactNode;
};

const ELEMENTS: { [T in ElementType]: ElementModule<T> } = {
  heading: {
    label: "Überschrift",
    problem: (e) => (e.data.text.trim() ? null : "Die Überschrift braucht einen Text."),
    View: HeadingView,
    Edit: HeadingEdit,
  },
  text: { label: "Text", problem: () => null, View: TextView, Edit: TextEdit },
  image: {
    label: "Bild",
    problem: (e) => (e.mediaId ? null : "Zuerst ein Bild aus der Mediathek wählen."),
    View: ImageView,
    Edit: ImageEdit,
  },
};

/** Elementtypen in der Reihenfolge des „Element hinzufügen“-Menüs. */
export const ELEMENT_TYPES = Object.keys(ELEMENTS) as ElementType[];

export const elementLabel = (type: ElementType) => ELEMENTS[type].label;

// Die Tabelle ist pro Typ getypt; hier wird das Element einmal auf seinen Typ eingeengt.
const moduleOf = (element: DraftElement) => ELEMENTS[element.type] as unknown as ElementModule<ElementType>;

export const elementProblem = (element: DraftElement) => moduleOf(element).problem(element as never);

export function ViewElement({ element }: { element: DraftElement }) {
  const { View } = moduleOf(element);
  return <View element={element as never} />;
}

export function EditElement({ element, onChange }: { element: DraftElement; onChange: (element: DraftElement) => void }) {
  const { Edit } = moduleOf(element);
  return <Edit element={element as never} onChange={onChange as never} />;
}
