import { z } from "zod";
import { headingSchema } from "./heading/schema";
import { imageSchema } from "./image/schema";
import { textSchema } from "./text/schema";

// Alle Elementtypen mit ihrer Definition (./<typ>/schema.ts, siehe define.ts). Daraus leiten
// sich die Typen für API, Server und Editor ab. Ein neuer Typ: Ordner mit schema.ts, show.tsx
// und view.tsx und je ein Eintrag hier, in show.tsx und in admin.tsx.

export const ELEMENT_SCHEMAS = { heading: headingSchema, text: textSchema, image: imageSchema };

type Schemas = typeof ELEMENT_SCHEMAS;
export type ElementType = keyof Schemas;
export const ELEMENT_TYPES = Object.keys(ELEMENT_SCHEMAS) as ElementType[];
export const elementLabel = (type: ElementType) => ELEMENT_SCHEMAS[type].label;
export const isElementType = (type: string): type is ElementType => Object.hasOwn(ELEMENT_SCHEMAS, type);

export type MediaRef = { id: string; url: string; width: number; height: number; alt: string };

type DataOf<T extends ElementType> = z.output<Schemas[T]["data"]>;
type HasMedia<T extends ElementType> = Schemas[T]["media"] extends true ? true : false;
type MediaPart<T extends ElementType> = HasMedia<T> extends true ? { mediaId: string; media: MediaRef } : unknown;
type Each<F extends { [T in ElementType]: unknown }> = F[ElementType];

/** Inhalt ohne id – wie ihn Show und View brauchen. */
export type ContentOf<T extends ElementType> = { type: T; data: DataOf<T> } & MediaPart<T>;
export type ElementContent = Each<{ [T in ElementType]: ContentOf<T> }>;

/** Geladenes Element (API-Antwort). */
export type ElementView = Each<{ [T in ElementType]: { id: string } & ContentOf<T> }>;

/** Element beim Speichern; ohne id: neu. */
export type ElementInput = Each<{
  [T in ElementType]: { id?: string; type: T; data: DataOf<T> } & (HasMedia<T> extends true ? { mediaId: string } : unknown);
}>;

/** Element im Entwurf des Editors; `id` nur, wenn es schon gespeichert ist. */
export type DraftOf<T extends ElementType> = { key: string; id?: string } & ContentOf<T>;
export type DraftElement = Each<{ [T in ElementType]: DraftOf<T> }>;

/** Element im Formular: wie im Entwurf, aber vielleicht unvollständig (z. B. noch kein Bild gewählt). */
export type CandidateOf<T extends ElementType> = { key: string; id?: string; type: T; data: DataOf<T> } & Partial<MediaPart<T>>;
export type ElementCandidate = Each<{ [T in ElementType]: CandidateOf<T> }>;

function inputSchema(type: ElementType) {
  const { data, media } = ELEMENT_SCHEMAS[type];
  return z.object({ id: z.uuid().optional(), type: z.literal(type), data, ...(media ? { mediaId: z.uuid() } : {}) });
}

type InputSchema = ReturnType<typeof inputSchema>;
export const elementInput = z.discriminatedUnion(
  "type",
  ELEMENT_TYPES.map(inputSchema) as [InputSchema, ...InputSchema[]],
) as unknown as z.ZodType<ElementInput>;

export const newElement = (type: ElementType, key: string) =>
  ({ key, type, data: ELEMENT_SCHEMAS[type].empty() }) as ElementCandidate;

/** Das fertige Element oder der Grund, warum es so noch nicht geht – nach dem Schema des Servers. */
export function completeElement(
  candidate: ElementCandidate,
): { ok: true; element: DraftElement } | { ok: false; problem: string } {
  const schema = ELEMENT_SCHEMAS[candidate.type];
  if (schema.media && !("media" in candidate && candidate.media)) {
    return { ok: false, problem: "Zuerst ein Bild aus der Mediathek wählen." };
  }
  const parsed = schema.data.safeParse(candidate.data);
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? "Ungültig" };
  return { ok: true, element: candidate as DraftElement };
}
