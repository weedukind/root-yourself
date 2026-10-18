// Icons der Admin-Oberfläche (Pfade im 24er-Raster, Strich statt Fläche). Knöpfe mit Icon tragen
// ihren Text als aria-label und title.

export function Icon({ d, small = false }: { d: string; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${small ? "h-4 w-4" : "h-5 w-5"} fill-none stroke-current stroke-2`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const UPLOAD_ICON = "M12 15V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4";
export const CUT_ICON =
  "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12";
export const DELETE_ICON = "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 5v6m4-6v6";
export const EDIT_ICON = "M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5ZM15 5l4 4";
export const ADD_ICON = "M12 5v14M5 12h14";
export const PASTE_ICON =
  "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2";
export const UP_ICON = "M12 19V5m-7 7 7-7 7 7";
export const DOWN_ICON = "M12 5v14m7-7-7 7-7-7";
export const APPLY_ICON = "M20 6 9 17l-5-5";
export const REVERT_ICON = "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5";
export const CLOSE_ICON = "M18 6 6 18M6 6l12 12";
export const TREE_ICON = "M21 12h-8M21 6H8M21 18h-8M3 6v4a2 2 0 0 0 2 2h3M3 10v6a2 2 0 0 0 2 2h3";
