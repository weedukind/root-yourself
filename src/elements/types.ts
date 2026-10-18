import type { ContentOf, ElementContent, ElementType } from "./schema";

// Ein Element ist in einem von drei Modi (docs/concept.md, „Elemente“):
//   Show – wie es die Website zeigt (<typ>/show.tsx, rendert auch auf dem Server)
//   View – wie es das Backend im Editor zeigt; der Editor legt Rahmen und Knöpfe drumherum
//   Edit – das Formular zum Bearbeiten, im Popup des Editors; entsteht aus den Attributen
//          der Definition (schema.ts, Arten in attributes.ts, Formular in form.tsx)
// Show und View bestimmt jeder Elementtyp in seinem Ordner; components.tsx sammelt sie.

export type ShowProps<T extends ElementType> = { element: ContentOf<T> };

/** Rendert ein Kind in der View – damit legt der Editor Rahmen und Knöpfe um den Inhaltsbereich der Seite. */
export type RenderChild = (child: ElementContent, index: number) => React.ReactNode;

/**
 * View: wie Show; Liste und Slide zeigen ihre Kinder im Show-Modus (bearbeitet werden sie in
 * ihrem Edit-Modus). Nur die Seite gibt ihr Kind über renderChild aus, falls angegeben.
 */
export type ViewProps<T extends ElementType> = ShowProps<T> & { renderChild?: RenderChild };
