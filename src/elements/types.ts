import type { CandidateOf, ContentOf, ElementType } from "./schema";

// Ein Element ist in einem von drei Modi (docs/concept.md, „Elemente“):
//   Show – wie es die Website zeigt (show.tsx, ohne "use client", rendert auch auf dem Server)
//   View – wie es das Backend im Editor zeigt; die Steuerelemente legt der Editor drumherum
//   Edit – das Formular zum Bearbeiten, im Popup des Editors
// Was ein Modus genau zeigt, bestimmt jeder Elementtyp in seinem Ordner.

export type ShowProps<T extends ElementType> = { element: ContentOf<T> };
export type EditProps<T extends ElementType> = { element: CandidateOf<T>; onChange: (element: CandidateOf<T>) => void };
