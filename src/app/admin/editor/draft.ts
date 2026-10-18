import {
  type ElementCandidate,
  type ElementContent,
  ELEMENT_SCHEMAS,
  type ElementType,
  newElement,
} from "@/elements/schema";
import type { ElementInput, ElementView, PageInput, SaveVersionInput, VersionDetail } from "@/shared/api/versions";

// Arbeitsstand des Editors: Titel, Tags und der Elementbaum ab der Seite. Elemente haben einen
// `key` für React; `id` haben nur gespeicherte (das Backend entscheidet anhand der id über
// Copy-on-Write). Der Baum darf unvollständige Elemente enthalten (z. B. Bild ohne Bild) –
// gespeichert wird erst, wenn elementProblems nichts mehr meldet. Bearbeitet wird der Baum mit
// den reinen Funktionen aus @/elements/tree.

export type Draft = { title: string; tagIds: string[]; root: ElementCandidate };

const newKey = () => crypto.randomUUID();

function toCandidate(element: ElementView): ElementCandidate {
  return {
    ...element,
    key: element.id,
    ...("children" in element ? { children: element.children.map(toCandidate) } : {}),
  } as ElementCandidate;
}

export function fromVersion(version: VersionDetail): Draft {
  return { title: version.title, tagIds: version.tags.map((t) => t.id), root: toCandidate(version.root) };
}

function toElementInput(element: ElementCandidate): ElementInput {
  const { id, type, data } = element;
  return {
    id,
    type,
    data,
    ...(ELEMENT_SCHEMAS[type].media ? { mediaId: "mediaId" in element ? element.mediaId : undefined } : {}),
    ...("children" in element ? { children: element.children.map(toElementInput) } : {}),
  } as ElementInput;
}

export function toInput(draft: Draft, updatedAt: string): SaveVersionInput {
  return { title: draft.title, tagIds: draft.tagIds, root: toElementInput(draft.root) as PageInput, updatedAt };
}

/** Vergleichbarer Inhalt – für „ungespeicherte Änderungen“. */
export const fingerprint = (draft: Draft) => JSON.stringify(toInput(draft, ""));

/**
 * Der Baum für die Ansicht im Editor. Ein Bild ohne gewähltes Bild lässt sich nicht zeigen; an
 * seiner Stelle steht ein Hinweis – an derselben Position, damit der Doppelklick (data-child-index)
 * zum richtigen Element im Baum führt.
 */
export function toView(element: ElementCandidate): ElementContent {
  if (ELEMENT_SCHEMAS[element.type].media && !("media" in element && element.media)) {
    return { type: "text", data: { markdown: "*Bild noch nicht gewählt*" } };
  }
  return {
    ...element,
    ...("children" in element ? { children: element.children.map(toView) } : {}),
  } as ElementContent;
}

/** Neues, leeres Element; vollständig wird es im Formular (siehe elementProblems). */
export const createElement = (type: ElementType): ElementCandidate => newElement(type, newKey());
