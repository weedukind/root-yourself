import { select } from "../attributes";

/** Ausrichtung der Kinder einer Liste oder Page. */
export const orientation = select({
  label: "Ausrichtung",
  options: [
    { value: "vertical", label: "Untereinander" },
    { value: "horizontal", label: "Nebeneinander" },
  ],
  default: "vertical",
});

export type Orientation = "vertical" | "horizontal";
