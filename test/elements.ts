import type { ElementInput, PageInput } from "@/shared/api/versions";

// Bausteine für Eingaben in Tests: page([…]) ist die Wurzel einer Version, die Elemente stehen in
// ihrem Inhaltsbereich (Liste).

export const text = (markdown: string, id?: string): ElementInput => ({ id, type: "text", data: { markdown } });
export const heading = (value: string, id?: string): ElementInput => ({ id, type: "heading", data: { level: 2, text: value } });
export const list = (children: ElementInput[], orientation: "vertical" | "horizontal" = "vertical", id?: string): ElementInput => ({
  id,
  type: "list",
  data: { orientation },
  children,
});
export const slide = (children: ElementInput[], id?: string): ElementInput => ({ id, type: "slide", data: {}, children });
export const page = (children: ElementInput[], id?: string, contentId?: string): PageInput => ({
  id,
  type: "page",
  data: {},
  children: [{ id: contentId, type: "list", data: { orientation: "vertical" }, children }],
});
