import { line, select } from "../attributes";
import { defineElement } from "../define";

export const headingSchema = defineElement({
  label: "Überschrift",
  attributes: {
    level: select({ label: "Ebene", options: [{ value: 2, label: "H2" }, { value: 3, label: "H3" }], default: 2 }),
    text: line({ label: "Überschrift", required: true, max: 300 }),
  },
});
