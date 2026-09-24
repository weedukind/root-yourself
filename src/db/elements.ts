import { z } from "zod";

// Inhalt von post_elements.data je Elementtyp (siehe docs/concept.md).
// Ein neuer Elementtyp wird hier ergänzt; braucht er eine FK-Spalte, zusätzlich im Schema.

export const headingData = z.object({
  level: z.union([z.literal(2), z.literal(3)]),
  text: z.string().min(1),
});

export const textData = z.object({
  markdown: z.string(),
});

export const imageData = z.object({
  caption: z.string().optional(),
});

export const element = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), data: headingData }),
  z.object({ type: z.literal("text"), data: textData }),
  z.object({ type: z.literal("image"), data: imageData, mediaId: z.uuid() }),
]);

export type Element = z.infer<typeof element>;
export type ElementType = Element["type"];
