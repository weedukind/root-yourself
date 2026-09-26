"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedPage, Teaser } from "@/shared/api/feed";
import { TeaserCard } from "./teaser-card";

// Nachladen weiterer Teaser: automatisch, sobald der Link „Weitere Posts“ ins Bild kommt.
// Ohne JavaScript ist es ein normaler Link auf die nächste Seite (?after=…).

export function MoreTeasers({ endpoint, initialCursor }: { endpoint: string; initialCursor: string | null }) {
  const [teasers, setTeasers] = useState<Teaser[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLAnchorElement>(null);

  async function loadMore() {
    if (!cursor || state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(`${endpoint}?after=${encodeURIComponent(cursor)}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as FeedPage;
      setTeasers((current) => [...current, ...page.teasers]);
      setCursor(page.nextCursor);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  // Die jeweils aktuelle Funktion für den Observer, ohne ihn bei jedem Render neu anzulegen.
  const load = useRef(loadMore);
  useEffect(() => {
    load.current = loadMore;
  });

  useEffect(() => {
    const element = sentinel.current;
    if (!element || state === "error") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load.current();
    }, { rootMargin: "400px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, state]);

  return (
    <>
      {teasers.map((teaser) => (
        <TeaserCard key={teaser.slug} teaser={teaser} />
      ))}
      {cursor && (
        <div className="text-center" aria-live="polite">
          {state === "error" ? (
            <button type="button" className="text-sm underline" onClick={loadMore}>
              Laden fehlgeschlagen – erneut versuchen
            </button>
          ) : (
            <a
              ref={sentinel}
              href={`?after=${encodeURIComponent(cursor)}`}
              className="text-sm underline"
              onClick={(event) => {
                event.preventDefault();
                void loadMore();
              }}
            >
              {state === "loading" ? "Lädt …" : "Weitere Posts"}
            </a>
          )}
        </div>
      )}
    </>
  );
}
