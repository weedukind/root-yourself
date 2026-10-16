"use client";

import { inputClass } from "@/app/admin/ui";
import type { EditProps } from "../types";

export function HeadingEdit({ element, onChange }: EditProps<"heading">) {
  return (
    <div className="flex gap-2">
      <select
        aria-label="Ebene"
        className={inputClass}
        value={element.data.level}
        onChange={(e) => onChange({ ...element, data: { ...element.data, level: Number(e.target.value) as 2 | 3 } })}
      >
        <option value={2}>H2</option>
        <option value={3}>H3</option>
      </select>
      <input
        aria-label="Überschrift"
        className={`${inputClass} min-w-0 flex-1 font-semibold`}
        placeholder="Überschrift"
        value={element.data.text}
        autoFocus
        onChange={(e) => onChange({ ...element, data: { ...element.data, text: e.target.value } })}
      />
    </div>
  );
}
