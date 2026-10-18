"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

// Einträge nebeneinander, je 300 × 300 px; was nicht hineinpasst, wird abgeschnitten. Passen sie
// nicht in die Breite, erscheinen Pfeile links und rechts (auf dem Handy auch wischen).

export function Carousel({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const scroll = (direction: -1 | 1) => {
    const el = track.current;
    // Um fast eine Breite weiter, damit der Anschluss sichtbar bleibt.
    el?.scrollBy({ left: direction * Math.max(300, el.clientWidth - 100), behavior: "smooth" });
  };
  const overflowing = !(edges.atStart && edges.atEnd);
  const arrow =
    "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-xl text-zinc-700 shadow hover:bg-white disabled:opacity-0";

  return (
    <div className="relative my-4" role="region" aria-roledescription="Karussell">
      <div ref={track} className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none]">
        {Children.map(children, (child) => (
          // Bilder schrumpfen im Kasten, damit eine Bildunterschrift darunter Platz hat.
          <div className="h-[300px] w-[300px] shrink-0 snap-start overflow-hidden [&_figure]:my-0 [&_figure]:flex [&_figure]:h-full [&_figure]:flex-col [&_img]:my-0 [&_img]:min-h-0 [&_img]:w-full [&_img]:flex-1 [&_img]:object-contain [&>*:first-child]:mt-0">
            {child}
          </div>
        ))}
      </div>
      {overflowing && (
        <>
          <button type="button" aria-label="Zurück" className={`${arrow} left-1`} disabled={edges.atStart} onClick={() => scroll(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Weiter" className={`${arrow} right-1`} disabled={edges.atEnd} onClick={() => scroll(1)}>
            ›
          </button>
        </>
      )}
    </div>
  );
}
