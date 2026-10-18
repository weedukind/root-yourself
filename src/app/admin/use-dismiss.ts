import { type RefObject, useEffect } from "react";

/**
 * Schließt ein aufgeklapptes Menü bei einem Klick daneben oder mit Escape. Mit closeOnScroll
 * auch beim Scrollen und bei Größenänderung – für Menüs, die fest am Bildschirm stehen.
 * onClose sollte stabil sein (useCallback), sonst werden die Listener bei jedem Rendern neu angemeldet.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { active = true, closeOnScroll = false }: { active?: boolean; closeOnScroll?: boolean } = {},
) {
  useEffect(() => {
    if (!active) return;
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Nur das Menü schließen, nicht auch ein Popup, in dem es steht.
      e.preventDefault();
      onClose();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    if (closeOnScroll) {
      window.addEventListener("scroll", onClose, true);
      window.addEventListener("resize", onClose);
    }
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [ref, onClose, active, closeOnScroll]);
}
