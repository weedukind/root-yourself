import { z } from "zod";

// Attribut-Arten der Elemente. Eine Art legt fest, welche Werte erlaubt sind (Zod-Schema), welchen
// Default ein neues Element bekommt und – über ihr Formular-Element in form.tsx – wie das
// Attribut im Edit-Modus dargestellt wird. Die Definitionen sind Daten plus Zod und laufen
// deshalb auch auf dem Server.

type Common = { label: string; placeholder?: string };

type LineSpec = Common & { max: number; default?: string };
type Line<S extends z.ZodType> = LineSpec & { kind: "line"; required: boolean; schema: S };

/** Einzeilige Eingabe, getrimmt. Ohne required ist das Attribut optional (leer: nicht gesetzt). */
// Überladungen statt eines Typparameters: Sonst leitet TypeScript „optional“ innerhalb von
// defineElement aus dem erwarteten Rückgabetyp ab statt aus dem Argument.
export function line(spec: LineSpec & { required: true }): Line<z.ZodString>;
export function line(spec: LineSpec & { required?: false }): Line<z.ZodOptional<z.ZodString>>;
export function line(spec: LineSpec & { required?: boolean }): Line<z.ZodString | z.ZodOptional<z.ZodString>> {
  const text = z.string().trim().max(spec.max);
  const schema = spec.required ? text.min(1, `${spec.label} darf nicht leer sein`) : text.optional();
  return { ...spec, kind: "line", required: spec.required ?? false, schema };
}

/** Mehrzeiliger Markdown-Text. */
export function markdown(spec: Common & { max: number; default?: string }) {
  return { ...spec, kind: "markdown" as const, schema: z.string().max(spec.max) };
}

/** Auswahl aus festen Werten (Zahlen oder Texte). */
export function select<const V extends string | number>(
  spec: Common & { options: readonly { value: V; label: string }[]; default: NoInfer<V> },
) {
  return { ...spec, kind: "select" as const, schema: z.literal(spec.options.map((o) => o.value)) as unknown as z.ZodType<V> };
}

/**
 * Bild aus der Mediathek, immer Pflicht. Steht nicht in elements.data, sondern in der Spalte
 * elements.media_id (die Datenbank verhindert so das Löschen verwendeter Bilder) – deshalb
 * höchstens eins pro Element.
 */
export function mediaRef(spec: Common) {
  return { ...spec, kind: "mediaRef" as const };
}

export type LineAttribute = Line<z.ZodString | z.ZodOptional<z.ZodString>>;
export type MarkdownAttribute = ReturnType<typeof markdown>;
export type SelectAttribute = ReturnType<typeof select>;
export type MediaRefAttribute = ReturnType<typeof mediaRef>;
export type Attribute = LineAttribute | MarkdownAttribute | SelectAttribute | MediaRefAttribute;
/** Attribute, die in elements.data stehen. */
export type DataAttribute = Exclude<Attribute, MediaRefAttribute>;

/** Wert eines neuen Elements; undefined: nicht gesetzt. */
export function defaultOf(attribute: DataAttribute): unknown {
  switch (attribute.kind) {
    case "line":
      return attribute.default ?? (attribute.required ? "" : undefined);
    case "markdown":
      return attribute.default ?? "";
    case "select":
      return attribute.default;
  }
}
