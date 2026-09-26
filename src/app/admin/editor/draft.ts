import type { ElementInput, MediaRef, RowView, SaveVersionInput, VersionDetail } from "@/shared/api/versions";
import { placeCells } from "@/shared/grid-placement";

// Arbeitsstand des Editors. Jedes Objekt hat einen `key` für React; `id` haben nur Elemente,
// die bereits gespeichert sind (das Backend entscheidet anhand der id über Copy-on-Write).
// Alle Funktionen sind rein und geben einen neuen Stand zurück.

export type DraftElement =
  | { key: string; id?: string; type: "heading"; data: { level: 2 | 3; text: string } }
  | { key: string; id?: string; type: "text"; data: { markdown: string } }
  | { key: string; id?: string; type: "image"; data: { caption?: string }; mediaId: string; media: MediaRef };

export type DraftCell = { key: string; width: number; height: number; elements: DraftElement[] };
export type DraftRow = { key: string; gridWidth: number; gridHeight: number; cells: DraftCell[] };
export type Draft = { title: string; tagIds: string[]; rows: DraftRow[] };

/** Position eines Elements: Row, Zelle, Index in der Zelle. */
export type ElementPath = { row: number; cell: number; index: number };

const newKey = () => crypto.randomUUID();

export function fromVersion(version: VersionDetail): Draft {
  return {
    title: version.title,
    tagIds: version.tags.map((t) => t.id),
    rows: version.rows.map((row) => ({
      key: row.id,
      gridWidth: row.gridWidth,
      gridHeight: row.gridHeight,
      cells: row.cells.map((cell) => ({
        key: cell.id,
        width: cell.width,
        height: cell.height,
        elements: cell.elements.map((e) => ({ ...e, key: e.id }) as DraftElement),
      })),
    })),
  };
}

function toElementInput(element: DraftElement): ElementInput {
  switch (element.type) {
    case "heading":
      return { id: element.id, type: "heading", data: element.data };
    case "text":
      return { id: element.id, type: "text", data: element.data };
    case "image":
      return { id: element.id, type: "image", data: element.data, mediaId: element.mediaId };
  }
}

export function toInput(draft: Draft, updatedAt: string): SaveVersionInput {
  return {
    title: draft.title,
    tagIds: draft.tagIds,
    rows: draft.rows.map((row) => ({
      gridWidth: row.gridWidth,
      gridHeight: row.gridHeight,
      cells: row.cells.map((cell) => ({
        width: cell.width,
        height: cell.height,
        elements: cell.elements.map(toElementInput),
      })),
    })),
    updatedAt,
  };
}

/** Für die Vorschau: dieselbe Form wie eine geladene Version. */
export function toRowViews(draft: Draft): RowView[] {
  return draft.rows.map((row) => ({
    id: row.key,
    gridWidth: row.gridWidth,
    gridHeight: row.gridHeight,
    cells: row.cells.map((cell) => ({
      id: cell.key,
      width: cell.width,
      height: cell.height,
      elements: cell.elements.map((e) => ({ ...e, id: e.id ?? e.key }) as RowView["cells"][number]["elements"][number]),
    })),
  }));
}

/** Vergleichbarer Inhalt – für „ungespeicherte Änderungen“. */
export const fingerprint = (draft: Draft) => JSON.stringify(toInput(draft, ""));

// --- Listen ----------------------------------------------------------------

/** Verschiebt ein Listenelement um `delta` Plätze; außerhalb der Grenzen bleibt alles, wie es ist. */
export function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

const replaceAt = <T>(list: T[], index: number, item: T) => list.map((x, i) => (i === index ? item : x));
const removeAt = <T>(list: T[], index: number) => list.filter((_, i) => i !== index);

// --- Rows ------------------------------------------------------------------

/**
 * Bekommt das Grid mehr Zellen, als es Zeilen hat, wächst es um die nötigen Zeilen – so passen
 * die Zellen immer ins Grid (die Obergrenze prüfen Editor und Backend).
 */
export function growToFit(row: DraftRow): DraftRow {
  const { rowCount } = placeCells(row.gridWidth, row.cells);
  return rowCount > row.gridHeight ? { ...row, gridHeight: rowCount } : row;
}

/** Neue Row mit 1 Spalte und einer Zelle; Grid und Zellen lassen sich danach einstellen. */
export function addRow(draft: Draft): Draft {
  const row: DraftRow = {
    key: newKey(),
    gridWidth: 1,
    gridHeight: 1,
    cells: [{ key: newKey(), width: 1, height: 1, elements: [] }],
  };
  return { ...draft, rows: [...draft.rows, row] };
}

export const removeRow = (draft: Draft, row: number): Draft => ({ ...draft, rows: removeAt(draft.rows, row) });

export const moveRow = (draft: Draft, row: number, delta: number): Draft => ({
  ...draft,
  rows: move(draft.rows, row, delta),
});

/**
 * Ändert die Grid-Größe; zu große Zellen werden auf das Grid verkleinert. Brauchen die Zellen
 * danach mehr Zeilen (z. B. bei weniger Spalten), wächst das Grid entsprechend.
 */
export function resizeGrid(draft: Draft, row: number, gridWidth: number, gridHeight: number): Draft {
  const current = draft.rows[row];
  return {
    ...draft,
    rows: replaceAt(
      draft.rows,
      row,
      growToFit({
        ...current,
        gridWidth,
        gridHeight,
        cells: current.cells.map((c) => ({ ...c, width: Math.min(c.width, gridWidth), height: Math.min(c.height, gridHeight) })),
      }),
    ),
  };
}

// --- Zellen ----------------------------------------------------------------

/** Ändert die Zellen einer Row; das Grid wächst bei Bedarf mit. */
function updateCells(draft: Draft, row: number, update: (cells: DraftCell[]) => DraftCell[]): Draft {
  const current = draft.rows[row];
  return { ...draft, rows: replaceAt(draft.rows, row, growToFit({ ...current, cells: update(current.cells) })) };
}

export const addCell = (draft: Draft, row: number): Draft =>
  updateCells(draft, row, (cells) => [...cells, { key: newKey(), width: 1, height: 1, elements: [] }]);

export const removeCell = (draft: Draft, row: number, cell: number): Draft =>
  updateCells(draft, row, (cells) => removeAt(cells, cell));

export const moveCell = (draft: Draft, row: number, cell: number, delta: number): Draft =>
  updateCells(draft, row, (cells) => move(cells, cell, delta));

export const resizeCell = (draft: Draft, row: number, cell: number, width: number, height: number): Draft =>
  updateCells(draft, row, (cells) => replaceAt(cells, cell, { ...cells[cell], width, height }));

// --- Elemente --------------------------------------------------------------

function updateElements(draft: Draft, row: number, cell: number, update: (elements: DraftElement[]) => DraftElement[]): Draft {
  return updateCells(draft, row, (cells) => replaceAt(cells, cell, { ...cells[cell], elements: update(cells[cell].elements) }));
}

export type NewElement =
  | { type: "heading" }
  | { type: "text" }
  | { type: "image"; media: MediaRef };

export function createElement(spec: NewElement): DraftElement {
  switch (spec.type) {
    case "heading":
      return { key: newKey(), type: "heading", data: { level: 2, text: "" } };
    case "text":
      return { key: newKey(), type: "text", data: { markdown: "" } };
    case "image":
      return { key: newKey(), type: "image", data: {}, mediaId: spec.media.id, media: spec.media };
  }
}

export const addElement = (draft: Draft, row: number, cell: number, element: DraftElement): Draft =>
  updateElements(draft, row, cell, (elements) => [...elements, element]);

export const updateElement = (draft: Draft, path: ElementPath, element: DraftElement): Draft =>
  updateElements(draft, path.row, path.cell, (elements) => replaceAt(elements, path.index, element));

export const removeElement = (draft: Draft, path: ElementPath): Draft =>
  updateElements(draft, path.row, path.cell, (elements) => removeAt(elements, path.index));

export const moveElementWithinCell = (draft: Draft, path: ElementPath, delta: number): Draft =>
  updateElements(draft, path.row, path.cell, (elements) => move(elements, path.index, delta));

/** Setzt ein Element ans Ende einer anderen Zelle (auch in einer anderen Row). */
export function moveElementToCell(draft: Draft, from: ElementPath, to: { row: number; cell: number }): Draft {
  if (from.row === to.row && from.cell === to.cell) return draft;
  const element = draft.rows[from.row].cells[from.cell].elements[from.index];
  return addElement(removeElement(draft, from), to.row, to.cell, element);
}

/** Alle Zellen als Ziel für „Verschieben nach …“. */
export function cellTargets(draft: Draft): { row: number; cell: number; label: string }[] {
  return draft.rows.flatMap((row, r) =>
    row.cells.map((_, c) => ({ row: r, cell: c, label: `Row ${r + 1}, Zelle ${c + 1}` })),
  );
}
