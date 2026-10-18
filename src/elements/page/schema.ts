import { defineElement } from "../define";
import { orientation } from "../list/orientation";

// Wurzel jeder Version: eine erweiterte Liste. Steht immer ganz oben im Baum und lässt sich weder
// hinzufügen noch verschieben oder löschen (root).
export const pageSchema = defineElement({
  label: "Seite",
  container: true,
  root: true,
  attributes: { orientation },
});
