import { line, mediaRef } from "../attributes";
import { defineElement } from "../define";

export const imageSchema = defineElement({
  label: "Bild",
  attributes: {
    media: mediaRef({ label: "Bild" }),
    caption: line({ label: "Bildunterschrift", max: 500, placeholder: "optional" }),
  },
});
