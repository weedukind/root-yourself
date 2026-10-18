import { z } from "zod";
import { headingSchema } from "./heading/schema";
import { imageSchema } from "./image/schema";
import { listSchema } from "./list/schema";
import { pageSchema } from "./page/schema";
import { slideSchema } from "./slide/schema";
import { textSchema } from "./text/schema";

// Alle Elementtypen mit ihrer Definition (./<typ>/schema.ts, siehe define.ts). Daraus leiten
// sich die Typen für API, Server und Editor ab. Ein neuer Typ: Ordner mit schema.ts, show.tsx
// und view.tsx und je ein Eintrag hier und in components.tsx. Container (z. B. Slide) enthalten
// weitere Elemente beliebigen Typs und beliebig tief.

export const ELEMENT_SCHEMAS = {
  heading: headingSchema,
  text: textSchema,
  image: imageSchema,
  list: listSchema,
  slide: slideSchema,
  page: pageSchema,
};

type Schemas = typeof ELEMENT_SCHEMAS;
export type ElementType = keyof Schemas;
export const ELEMENT_TYPES = Object.keys(ELEMENT_SCHEMAS) as ElementType[];
export const elementLabel = (type: ElementType) => ELEMENT_SCHEMAS[type].label;
export const isElementType = (type: string): type is ElementType => Object.hasOwn(ELEMENT_SCHEMAS, type);
export const isContainer = (type: ElementType) => ELEMENT_SCHEMAS[type].container;
/** Die Wurzel einer Version (Page): steht nur ganz oben. */
export const isRoot = (type: ElementType) => ELEMENT_SCHEMAS[type].root;
/** Container, in die man Elemente einfügen kann; die Wurzel hat nur ihren Inhaltsbereich. */
export const takesChildren = (type: ElementType) => isContainer(type) && !isRoot(type);
/** Typ des Inhaltsbereichs, des einzigen Kinds der Wurzel. */
export const ROOT_CONTENT_TYPE = "list" satisfies ElementType;
/** Typen, die man in einen Container einfügen kann (alle außer der Wurzel). */
export const ADDABLE_TYPES = ELEMENT_TYPES.filter((type) => !isRoot(type));

export type MediaRef = { id: string; url: string; width: number; height: number; alt: string };

type DataOf<T extends ElementType> = z.output<Schemas[T]["data"]>;
type HasMedia<T extends ElementType> = Schemas[T]["media"] extends true ? true : false;
type MediaPart<T extends ElementType> = HasMedia<T> extends true ? { mediaId: string; media: MediaRef } : unknown;
/**
 * Container haben children; L ist die Liste in der jeweiligen Form. Die Listen sind leere
 * Interfaces (… extends Array<…>): Mit einem Typ-Alias wie ElementView[] meldet TypeScript
 * „circularly references itself“, Interfaces löst es erst bei Bedarf auf.
 */
type ChildrenPart<T extends ElementType, L> = Schemas[T]["container"] extends true ? { children: L } : unknown;
type Each<F extends { [T in ElementType]: unknown }> = F[ElementType];

/** Inhalt ohne id – wie ihn Show und View brauchen. */
export type ContentOf<T extends ElementType> = { type: T; data: DataOf<T> } & MediaPart<T> & ChildrenPart<T, ContentList>;
export type ElementContent = Each<{ [T in ElementType]: ContentOf<T> }>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Rekursion, siehe ChildrenPart
interface ContentList extends Array<ElementContent> {}

/** Geladenes Element (API-Antwort). */
export type ElementView = Each<{ [T in ElementType]: { id: string; type: T; data: DataOf<T> } & MediaPart<T> & ChildrenPart<T, ViewList> }>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Rekursion, siehe ChildrenPart
interface ViewList extends Array<ElementView> {}

/** Element beim Speichern; ohne id: neu. */
export type ElementInput = Each<{
  [T in ElementType]: { id?: string; type: T; data: DataOf<T> } & (HasMedia<T> extends true ? { mediaId: string } : unknown) &
    ChildrenPart<T, InputList>;
}>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Rekursion, siehe ChildrenPart
interface InputList extends Array<ElementInput> {}

/** Element im Entwurf des Editors; `id` nur, wenn es schon gespeichert ist. */
export type DraftOf<T extends ElementType> = { key: string; id?: string; type: T; data: DataOf<T> } & MediaPart<T> &
  ChildrenPart<T, DraftList>;
export type DraftElement = Each<{ [T in ElementType]: DraftOf<T> }>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Rekursion, siehe ChildrenPart
interface DraftList extends Array<DraftElement> {}

/** Element im Formular: wie im Entwurf, aber vielleicht unvollständig (z. B. noch kein Bild gewählt). */
export type CandidateOf<T extends ElementType> = { key: string; id?: string; type: T; data: DataOf<T> } & Partial<MediaPart<T>> &
  ChildrenPart<T, CandidateList>;
export type ElementCandidate = Each<{ [T in ElementType]: CandidateOf<T> }>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Rekursion, siehe ChildrenPart
interface CandidateList extends Array<ElementCandidate> {}

/** Kinder eines Elements; leer, wenn es kein Container ist. */
export const childrenOf = <E extends { type: ElementType }>(element: E): E[] =>
  "children" in element ? (element.children as E[]) : [];

/** Alle Elemente eines Baums in Lesereihenfolge (Elternteil vor seinen Kindern). */
export function flattenElements<E extends { type: ElementType }>(list: E[]): E[] {
  return list.flatMap((element) => [element, ...flattenElements(childrenOf(element))]);
}

function inputSchema(type: ElementType): z.ZodType {
  const { data, media, container, root } = ELEMENT_SCHEMAS[type];
  // Rekursiv: Kinder beliebigen Typs außer der Wurzel. Die Menge begrenzt saveVersionInput.
  // Die Wurzel hat genau ein Kind, ihren Inhaltsbereich.
  const children = root ? z.tuple([z.lazy(() => inputSchema(ROOT_CONTENT_TYPE))]) : z.array(z.lazy(() => elementInput));
  return z.object({
    id: z.uuid().optional(),
    type: z.literal(type),
    data,
    ...(media ? { mediaId: z.uuid() } : {}),
    ...(container ? { children } : {}),
  });
}

/** Ein Element unterhalb der Wurzel. */
export const elementInput: z.ZodType<ElementInput> = z.lazy(() =>
  z.discriminatedUnion("type", ADDABLE_TYPES.map(inputSchema) as [z.ZodObject, ...z.ZodObject[]]),
) as unknown as z.ZodType<ElementInput>;

/** Die Wurzel (Page) in der jeweiligen Form, mit ihrem einzigen Kind, dem Inhaltsbereich. */
export type RootOf<E extends { type: ElementType }> = Omit<Extract<E, { type: "page" }>, "children"> & {
  children: [Extract<E, { type: typeof ROOT_CONTENT_TYPE }>];
};

/** Die Wurzel einer Version: eine Page mit ihrem Inhaltsbereich. */
export const pageInput = inputSchema("page") as unknown as z.ZodType<RootOf<ElementInput>>;

/** Leeres Element; eine neue Wurzel bekommt gleich ihren leeren Inhaltsbereich (Key: key + ".content"). */
export const newElement = (type: ElementType, key: string): ElementCandidate =>
  ({
    key,
    type,
    data: ELEMENT_SCHEMAS[type].empty(),
    ...(isContainer(type) ? { children: isRoot(type) ? [newElement(ROOT_CONTENT_TYPE, `${key}.content`)] : [] } : {}),
  }) as ElementCandidate;

/** Pfad eines Elements im Baum eines Containers: Indizes der Kinder, [] ist die Wurzel. */
export type TreePath = number[];
export const pathKey = (path: TreePath) => path.join(".");

/** Warum ein einzelnes Element (ohne seine Kinder) so noch nicht geht; null: in Ordnung. */
function problemOf(candidate: ElementCandidate): string | null {
  const schema = ELEMENT_SCHEMAS[candidate.type];
  if (schema.media && !("media" in candidate && candidate.media)) return "Zuerst ein Bild aus der Mediathek wählen.";
  const parsed = schema.data.safeParse(candidate.data);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Ungültig");
}

/** Probleme aller Elemente eines Baums, nach Pfad (pathKey). */
export function elementProblems(candidate: ElementCandidate, path: TreePath = []): Map<string, string> {
  const problems = new Map<string, string>();
  const own = problemOf(candidate);
  if (own) problems.set(pathKey(path), own);
  childrenOf(candidate).forEach((child, i) => {
    for (const [key, problem] of elementProblems(child, [...path, i])) problems.set(key, problem);
  });
  return problems;
}

/** Das fertige Element samt Kindern oder das erste Problem – nach dem Schema des Servers. */
export function completeElement(
  candidate: ElementCandidate,
): { ok: true; element: DraftElement } | { ok: false; problem: string } {
  const [problem] = elementProblems(candidate).values();
  return problem ? { ok: false, problem } : { ok: true, element: candidate as DraftElement };
}
