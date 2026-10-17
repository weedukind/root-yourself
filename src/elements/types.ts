import type { ContentOf, ElementType } from "./schema";

// Ein Element ist in einem von drei Modi (docs/concept.md, „Elemente“):
//   Show – wie es die Website zeigt (<typ>/show.tsx, rendert auch auf dem Server)
//   View – wie es das Backend im Editor zeigt; die Steuerelemente legt der Editor drumherum
//   Edit – das Formular zum Bearbeiten, im Popup des Editors; entsteht aus den Attributen
//          der Definition (schema.ts, Arten in attributes.ts, Formular in form.tsx)
// Show und View bestimmt jeder Elementtyp in seinem Ordner; components.tsx sammelt sie.

export type ShowProps<T extends ElementType> = { element: ContentOf<T> };
