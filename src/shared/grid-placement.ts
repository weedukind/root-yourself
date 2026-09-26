// Rechnet nach, wo der Browser die Zellen einer Row platziert (CSS-Grid-Auto-Placement,
// „sparse“, zeilenweise; gegen Chromium geprüft). Die öffentliche Seite überlässt das dem
// Browser; der Editor braucht die Positionen für die freien Felder, Editor und Backend für die
// Regel „alle Zellen passen ins Grid“. Alle Angaben 0-basiert.

export type Placement = { col: number; row: number };

export function placeCells(
  gridWidth: number,
  cells: { width: number; height: number }[],
): { placements: Placement[]; rowCount: number } {
  const occupied = new Set<string>();
  const fits = (col: number, row: number, width: number, height: number) => {
    if (col + width > gridWidth) return false;
    for (let r = row; r < row + height; r++) {
      for (let c = col; c < col + width; c++) if (occupied.has(`${c}:${r}`)) return false;
    }
    return true;
  };

  // Der Cursor bewegt sich nur vorwärts: Eine spätere Zelle rückt nie vor eine frühere.
  let cursor = { col: 0, row: 0 };
  let rowCount = 0;
  const placements = cells.map(({ width, height }) => {
    const w = Math.min(width, gridWidth);
    let { col, row } = cursor;
    while (!fits(col, row, w, height)) {
      col++;
      if (col + w > gridWidth) {
        col = 0;
        row++;
      }
    }
    for (let r = row; r < row + height; r++) {
      for (let c = col; c < col + w; c++) occupied.add(`${c}:${r}`);
    }
    cursor = { col: col + w, row };
    rowCount = Math.max(rowCount, row + height);
    return { col, row };
  });

  return { placements, rowCount };
}

/** Felder des Grids, die keine Zelle belegt. */
export function freeSlots(
  gridWidth: number,
  rows: number,
  cells: { width: number; height: number }[],
  placements: Placement[],
): Placement[] {
  const occupied = new Set<string>();
  cells.forEach((cell, i) => {
    for (let r = placements[i].row; r < placements[i].row + cell.height; r++) {
      for (let c = placements[i].col; c < placements[i].col + cell.width; c++) occupied.add(`${c}:${r}`);
    }
  });
  const free: Placement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < gridWidth; col++) if (!occupied.has(`${col}:${row}`)) free.push({ col, row });
  }
  return free;
}

/** true, wenn alle Zellen innerhalb der Zeilen des Grids liegen. */
export function fitsGrid(gridWidth: number, gridHeight: number, cells: { width: number; height: number }[]): boolean {
  return placeCells(gridWidth, cells).rowCount <= gridHeight;
}
