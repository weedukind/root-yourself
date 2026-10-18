import { defineElement } from "../define";
import { orientation } from "./orientation";

// Container: beliebig viele Elemente beliebigen Typs, untereinander oder nebeneinander (stack.tsx),
// ohne Aufzählungszeichen.
export const listSchema = defineElement({
  label: "Liste",
  container: true,
  attributes: { orientation },
});
