import type { DraftElement } from "@/app/admin/editor/draft";
import type { ElementView } from "@/shared/api/versions";

// Ein Element ist in einem von drei Modi (docs/concept.md, „Elemente“):
//   Show – wie es die Website zeigt (show.tsx, ohne "use client", rendert auch auf dem Server)
//   View – wie es das Backend im Editor zeigt; die Steuerelemente legt der Editor drumherum
//   Edit – das Formular zum Bearbeiten, im Popup des Editors
// Was ein Modus genau zeigt, bestimmt jeder Elementtyp in seinem Ordner.

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Inhalt eines Elements ohne id/key – passt für geladene Versionen und den Entwurf. */
export type ElementContent = WithoutId<ElementView>;
export type ElementType = ElementContent["type"];

export type ContentOf<T extends ElementType> = Extract<ElementContent, { type: T }>;
export type DraftOf<T extends ElementType> = Extract<DraftElement, { type: T }>;

export type ShowProps<T extends ElementType> = { element: ContentOf<T> };
export type EditProps<T extends ElementType> = { element: DraftOf<T>; onChange: (element: DraftOf<T>) => void };
