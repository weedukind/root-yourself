import { defineElement } from "../define";

// Container für beliebig viele Elemente beliebigen Typs, auch Slides. Im Frontend nebeneinander
// (je 300 × 300 px), mit Pfeilen, wenn sie nicht in die Breite passen.
export const slideSchema = defineElement({
  label: "Slide",
  container: true,
  attributes: {},
});
