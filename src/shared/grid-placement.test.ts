import { describe, expect, it } from "vitest";
import { fitsGrid, freeSlots, placeCells } from "./grid-placement";

const cell = (width: number, height = 1) => ({ width, height });

describe("placeCells", () => {
  it("füllt zeilenweise von links oben", () => {
    expect(placeCells(3, [cell(1), cell(1), cell(1), cell(1)])).toEqual({
      placements: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
        { col: 0, row: 1 },
      ],
      rowCount: 2,
    });
  });

  it("großes Feld links, zwei kleine rechts übereinander", () => {
    expect(placeCells(3, [cell(2, 2), cell(1), cell(1)]).placements).toEqual([
      { col: 0, row: 0 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
    ]);
  });

  it("eine spätere Zelle rückt nicht in eine Lücke vor einer früheren", () => {
    // 3 Spalten: [1][–][–] dann eine 3 breite Zelle → neue Zeile; die 1 breite danach
    // kommt rechts daneben nicht in Frage, sondern hinter die breite.
    expect(placeCells(3, [cell(1), cell(3), cell(1)]).placements).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
    ]);
  });
});

describe("freeSlots", () => {
  it("zeigt die freien Felder eines teilweise gefüllten Grids", () => {
    const cells = [cell(2)];
    const { placements } = placeCells(3, cells);
    expect(freeSlots(3, 2, cells, placements)).toEqual([
      { col: 2, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
  });
});

describe("fitsGrid", () => {
  it("6 Zellen füllen ein 3×2 Grid genau; eine breitere Zelle passt nicht mehr", () => {
    const six = Array.from({ length: 6 }, () => cell(1));
    expect(fitsGrid(3, 2, six)).toBe(true);
    expect(fitsGrid(3, 2, [cell(2), ...six.slice(1)])).toBe(false);
  });

  it("die Reihenfolge entscheidet mit", () => {
    // [2][1] / [1][2] passt in 3×2, [2][2]… nicht
    expect(fitsGrid(3, 2, [cell(2), cell(1), cell(1), cell(2)])).toBe(true);
    expect(fitsGrid(3, 2, [cell(2), cell(2), cell(1), cell(1)])).toBe(false);
  });
});
