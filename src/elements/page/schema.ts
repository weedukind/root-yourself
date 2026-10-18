import { defineElement } from "../define";

// Wurzel jeder Version. Steht immer ganz oben im Baum und lässt sich weder hinzufügen noch
// verschieben oder löschen (root). Ihr einziges Kind ist der Inhaltsbereich, eine Liste; auch die
// steht fest (siehe isFixed in tree.ts), die Elemente der Seite kommen in sie.
export const pageSchema = defineElement({
  label: "Seite",
  container: true,
  root: true,
  attributes: {},
});
