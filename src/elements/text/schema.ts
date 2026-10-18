import { markdown } from "../attributes";
import { defineElement } from "../define";

export const textSchema = defineElement({
  label: "Text",
  attributes: {
    markdown: markdown({
      label: "Text (Markdown)",
      max: 50_000,
      placeholder: "**fett**, *kursiv*, [Link](https://…), - Liste",
    }),
  },
});
