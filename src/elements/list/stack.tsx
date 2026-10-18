import type { Orientation } from "./orientation";

// Anordnung der Kinder von Liste und Page (ohne "use client", rendert auch auf dem Server):
// - vertical: untereinander, jedes Kind in seiner Höhe, so breit wie das Elternteil
// - horizontal: n Kinder je 1/n der Breite, die Reihe so hoch wie das höchste Kind; auf schmalen
//   Bildschirmen (unter md, 768 px) untereinander

export function Stack({ orientation, children }: { orientation: Orientation; children: React.ReactNode[] }) {
  if (orientation === "vertical") return <div>{children}</div>;
  return (
    <div
      className="grid gap-6 md:grid-cols-[repeat(var(--n),minmax(0,1fr))] [&>*>*:first-child]:mt-0 [&>*>*:last-child]:mb-0"
      style={{ "--n": children.length } as React.CSSProperties}
    >
      {children.map((child, i) => (
        <div key={i} className="min-w-0">
          {child}
        </div>
      ))}
    </div>
  );
}
