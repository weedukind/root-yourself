"use client";

import { inputClass } from "@/app/admin/ui";
import type { EditProps } from "../types";

export function TextEdit({ element, onChange }: EditProps<"text">) {
  return (
    <textarea
      aria-label="Text (Markdown)"
      className={`${inputClass} min-h-60 w-full font-mono`}
      placeholder="Text – Markdown: **fett**, *kursiv*, [Link](https://…), - Liste"
      value={element.data.markdown}
      autoFocus
      onChange={(e) => onChange({ ...element, data: { markdown: e.target.value } })}
    />
  );
}
