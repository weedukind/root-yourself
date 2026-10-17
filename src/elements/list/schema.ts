import { defineElement } from "../define";

// Container: beliebig viele Elemente beliebigen Typs, untereinander, ohne Aufzählungszeichen.
export const listSchema = defineElement({
  label: "Liste",
  container: true,
  attributes: {},
});
