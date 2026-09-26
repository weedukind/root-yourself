"use client";

import { MAX_GRID } from "@/shared/api/versions";
import { inputClass, secondaryButton } from "../ui";
import {
  addCell,
  addElement,
  addRow,
  cellTargets,
  createElement,
  type Draft,
  type DraftRow,
  type ElementPath,
  moveCell,
  moveElementToCell,
  moveElementWithinCell,
  moveRow,
  removeCell,
  removeElement,
  removeRow,
  resizeCell,
  resizeGrid,
  updateElement,
} from "./draft";
import { ElementForm, elementLabel, MediaPicker } from "./element-editor";
import { fitsGrid, freeSlots, placeCells } from "@/shared/grid-placement";

// Bearbeitung des Layouts: Rows → Zellen → Elemente. Alle Änderungen laufen über die reinen
// Funktionen aus ./draft.

type Update = (change: (draft: Draft) => Draft) => void;

const small = `${secondaryButton} px-2 py-0.5 text-xs`;
const sizes = (max: number) => Array.from({ length: max }, (_, i) => i + 1);

/** Das Grid wächst bei Änderungen mit (siehe growToFit) – aber höchstens bis MAX_GRID Zeilen. */
const withinLimit = (row: DraftRow) => row.gridHeight <= MAX_GRID && fitsGrid(row.gridWidth, row.gridHeight, row.cells);

/** Werte von 1 bis max, deren Ergebnis gültig ist. Der aktuelle Wert bleibt immer wählbar. */
function validSizes(max: number, current: number, rowWith: (value: number) => DraftRow): number[] {
  return sizes(max).filter((n) => n === current || withinLimit(rowWith(n)));
}

function SizeSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-zinc-600">
      {label}
      <select className={`${inputClass} py-0 text-xs`} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LayoutEditor({ draft, update, readOnly }: { draft: Draft; update: Update; readOnly: boolean }) {
  const targets = cellTargets(draft);

  return (
    <div className="space-y-4">
      {draft.rows.length === 0 && <p className="text-sm text-zinc-500">Noch keine Rows.</p>}

      {draft.rows.map((row, r) => {
        // Positionen wie im Browser, damit auch freie Felder des Grids sichtbar sind.
        const { placements, rowCount } = placeCells(row.gridWidth, row.cells);
        const free = freeSlots(row.gridWidth, row.gridHeight, row.cells, placements);
        // Änderungen probeweise durchrechnen: Nur was danach ins Grid passt, wird angeboten.
        const after = (change: (d: Draft) => Draft) => change(draft).rows[r];
        const canAddCell = withinLimit(after((d) => addCell(d, r)));
        const widestCell = Math.max(1, ...row.cells.map((cell) => cell.width));
        return (
          <section key={row.key} className="space-y-3 rounded border border-zinc-300 bg-white p-3">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Row {r + 1}</h3>
              <SizeSelect
                label="Spalten"
                value={row.gridWidth}
                // Nicht schmaler als die breiteste Zelle – Zellen werden nie stillschweigend verkleinert.
                options={validSizes(MAX_GRID, row.gridWidth, (w) => after((d) => resizeGrid(d, r, w, row.gridHeight))).filter(
                  (w) => w >= widestCell,
                )}
                disabled={readOnly}
                onChange={(w) => update((d) => resizeGrid(d, r, w, row.gridHeight))}
              />
              <SizeSelect
                label="Zeilen"
                value={row.gridHeight}
                // Weniger Zeilen, als die Zellen brauchen, ergäben sofort wieder mehr – daher nicht anbieten.
                options={sizes(MAX_GRID).filter((h) => h === row.gridHeight || h >= rowCount)}
                disabled={readOnly}
                onChange={(h) => update((d) => resizeGrid(d, r, row.gridWidth, h))}
              />
              {!readOnly && (
                <div className="ml-auto flex gap-1">
                  <button type="button" className={small} disabled={r === 0} onClick={() => update((d) => moveRow(d, r, -1))} aria-label="Row nach oben">
                    ↑
                  </button>
                  <button type="button" className={small} disabled={r === draft.rows.length - 1} onClick={() => update((d) => moveRow(d, r, 1))} aria-label="Row nach unten">
                    ↓
                  </button>
                  <button
                    type="button"
                    className={small}
                    disabled={!canAddCell}
                    title={canAddCell ? undefined : `Das Grid hätte mehr als ${MAX_GRID} Zeilen`}
                    onClick={() => update((d) => addCell(d, r))}
                  >
                    + Zelle
                  </button>
                  <button type="button" className={small} onClick={() => update((d) => removeRow(d, r))}>
                    Row entfernen
                  </button>
                </div>
              )}
            </header>

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${row.gridWidth}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.max(row.gridHeight, rowCount)}, minmax(4rem, auto))`,
              }}
            >
              {free.map((slot) => (
                <div
                  key={`free-${slot.col}-${slot.row}`}
                  aria-hidden
                  className="flex items-center justify-center rounded border border-dashed border-zinc-200 text-xs text-zinc-400"
                  style={{ gridColumn: slot.col + 1, gridRow: slot.row + 1 }}
                >
                  frei
                </div>
              ))}
              {row.cells.map((cell, c) => (
                <div
                  key={cell.key}
                  className="space-y-2 rounded border border-dashed border-zinc-400 bg-zinc-50 p-2"
                  style={{
                    gridColumn: `${placements[c].col + 1} / span ${cell.width}`,
                    gridRow: `${placements[c].row + 1} / span ${cell.height}`,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-600">Zelle {c + 1}</span>
                    <SizeSelect
                    label="Breite"
                    value={cell.width}
                    options={validSizes(row.gridWidth, cell.width, (w) => after((d) => resizeCell(d, r, c, w, cell.height)))}
                    disabled={readOnly}
                    onChange={(w) => update((d) => resizeCell(d, r, c, w, cell.height))}
                  />
                    <SizeSelect
                    label="Höhe"
                    value={cell.height}
                    options={validSizes(row.gridHeight, cell.height, (h) => after((d) => resizeCell(d, r, c, cell.width, h)))}
                    disabled={readOnly}
                    onChange={(h) => update((d) => resizeCell(d, r, c, cell.width, h))}
                  />
                    {!readOnly && (
                      <div className="ml-auto flex gap-1">
                        <button type="button" className={small} disabled={c === 0 || !withinLimit(after((d) => moveCell(d, r, c, -1)))} onClick={() => update((d) => moveCell(d, r, c, -1))} aria-label="Zelle nach vorn">
                          ←
                        </button>
                        <button type="button" className={small} disabled={c === row.cells.length - 1 || !withinLimit(after((d) => moveCell(d, r, c, 1)))} onClick={() => update((d) => moveCell(d, r, c, 1))} aria-label="Zelle nach hinten">
                          →
                        </button>
                        <button type="button" className={small} onClick={() => update((d) => removeCell(d, r, c))} aria-label="Zelle entfernen">
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {cell.elements.map((element, i) => {
                    const path: ElementPath = { row: r, cell: c, index: i };
                    return (
                      <div key={element.key} className="space-y-1 rounded border border-zinc-200 bg-white p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-xs font-medium text-zinc-500">{elementLabel(element)}</span>
                          {!readOnly && (
                            <div className="ml-auto flex flex-wrap gap-1">
                              <button type="button" className={small} disabled={i === 0} onClick={() => update((d) => moveElementWithinCell(d, path, -1))} aria-label="Element nach oben">
                                ↑
                              </button>
                              <button type="button" className={small} disabled={i === cell.elements.length - 1} onClick={() => update((d) => moveElementWithinCell(d, path, 1))} aria-label="Element nach unten">
                                ↓
                              </button>
                              {targets.length > 1 && (
                                <select
                                  aria-label="In andere Zelle verschieben"
                                  className={`${inputClass} py-0 text-xs`}
                                  value=""
                                  onChange={(e) => {
                                    const target = targets[Number(e.target.value)];
                                    update((d) => moveElementToCell(d, path, target));
                                  }}
                                >
                                  <option value="" disabled>
                                    Verschieben nach …
                                  </option>
                                  {targets.map((t, index) =>
                                    t.row === r && t.cell === c ? null : (
                                      <option key={t.label} value={index}>
                                        {t.label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              )}
                              <button type="button" className={small} onClick={() => update((d) => removeElement(d, path))} aria-label="Element entfernen">
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                        <ElementForm element={element} readOnly={readOnly} onChange={(next) => update((d) => updateElement(d, path, next))} />
                      </div>
                    );
                  })}

                  {!readOnly && (
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className={small} onClick={() => update((d) => addElement(d, r, c, createElement({ type: "heading" })))}>
                        + Überschrift
                      </button>
                      <button type="button" className={small} onClick={() => update((d) => addElement(d, r, c, createElement({ type: "text" })))}>
                        + Text
                      </button>
                      <MediaPicker label="+ Bild" buttonClass={small} onPick={(media) => update((d) => addElement(d, r, c, createElement({ type: "image", media })))} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {!readOnly && (
        <button type="button" className={secondaryButton} onClick={() => update(addRow)}>
          + Row
        </button>
      )}
    </div>
  );
}
