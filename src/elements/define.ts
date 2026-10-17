import { z } from "zod";
import { type Attribute, type DataAttribute, defaultOf } from "./attributes";

type MediaKeys<A> = { [K in keyof A]: A[K] extends { kind: "mediaRef" } ? K : never }[keyof A];
type DataShape<A> = { [K in Exclude<keyof A, MediaKeys<A>>]: A[K] extends { schema: infer S extends z.ZodType } ? S : never };

/**
 * Definition eines Elementtyps: sein Name und ein Objekt mit einem Eintrag pro Attribut
 * (Arten in attributes.ts). Daraus entstehen
 * - data: das Zod-Schema für elements.data (Server und Popup prüfen damit)
 * - media: ob der Typ auf ein Bild der Mediathek verweist (elements.media_id)
 * - empty: die Daten eines neuen Elements aus den Defaults
 * Das Formular des Edit-Modus baut form.tsx aus denselben Attributen.
 */
export function defineElement<const A extends Record<string, Attribute>>(definition: { label: string; attributes: A }) {
  const entries = Object.entries(definition.attributes) as [string, Attribute][];
  const mediaRefs = entries.filter(([, a]) => a.kind === "mediaRef");
  if (mediaRefs.length > 1) throw new Error(`${definition.label}: höchstens ein Bild-Attribut (Spalte elements.media_id)`);
  const fields = entries.filter((entry): entry is [string, DataAttribute] => entry[1].kind !== "mediaRef");

  const data = z.object(Object.fromEntries(fields.map(([key, a]) => [key, a.schema]))) as unknown as z.ZodObject<DataShape<A>>;
  return {
    label: definition.label,
    attributes: definition.attributes,
    data,
    media: (mediaRefs.length > 0) as [MediaKeys<A>] extends [never] ? false : true,
    empty: () =>
      Object.fromEntries(
        fields.flatMap(([key, a]) => {
          const value = defaultOf(a);
          return value === undefined ? [] : [[key, value]];
        }),
      ) as z.output<typeof data>,
  };
}
