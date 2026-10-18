"use client";

import { useState } from "react";
import { ViewElement } from "@/elements/components";
import { type ElementCandidate, type ElementContent, elementLabel, pathKey, type TreePath } from "@/elements/schema";
import { EDIT_ICON, Icon } from "../icons";
import { smallIconButton } from "../ui";
import { toView } from "./draft";
import { EditDialog, hasEditMode } from "./edit-dialog";

// Inhalt einer Version bearbeiten. Wurzel ist die Seite, ihr Inhaltsbereich eine Liste; beide
// stehen fest. Die Ansicht zeigt die Seite im View-Modus, Seite und Inhaltsbereich je in einem
// Rahmen; die Liste zeigt ihre Kinder wie auf der Website. „Bearbeiten“ (oder Doppelklick) am
// Inhaltsbereich öffnet den Edit-Modus im Popup (edit-dialog.tsx): Ausrichtung, Kinder und auf
// Wunsch der Baum. Gespeichert wird mit der Version.

export function PageEditor({
  root,
  problems,
  readOnly,
  onChange,
}: {
  root: ElementCandidate;
  problems: Map<string, string>;
  readOnly: boolean;
  onChange: (root: ElementCandidate) => void;
}) {
  // Element, dessen Edit-Modus im Popup offen ist.
  const [editing, setEditing] = useState<TreePath | null>(null);

  /** Ein Element der Ansicht in seinem Rahmen; die Seite rahmt so ihren Inhaltsbereich ein. */
  const framed = (content: ElementContent, path: TreePath): React.ReactNode => {
    const key = pathKey(path);
    // Die Kinder einer Liste haben keinen eigenen Rahmen: ihre Probleme zeigt der Rahmen der Liste.
    const problem =
      problems.get(key) ?? (path.length > 0 ? [...problems].find(([k]) => k.startsWith(`${key}.`))?.[1] : undefined);
    return (
      <ElementFrame
        key={key}
        path={path}
        label={elementLabel(content.type)}
        problem={problem}
        onEdit={!readOnly && hasEditMode(content.type) ? () => setEditing(path) : undefined}
      >
        <ViewElement element={content} renderChild={(child, i) => framed(child, [...path, i])} />
      </ElementFrame>
    );
  };

  return (
    <div>
      <section aria-label="Ansicht" className="prose prose-zinc min-w-0 max-w-none">
        {framed(toView(root), [])}
      </section>

      {editing && <EditDialog saved={root} initialPath={editing} onApply={onChange} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Rahmen um ein Element in der Ansicht: Bezeichnung und „Bearbeiten“, darunter seine View. */
function ElementFrame({
  path,
  label,
  problem,
  onEdit,
  children,
}: {
  path: TreePath;
  label: string;
  problem?: string;
  /** Fehlt ohne Edit-Modus und bei eingefrorenen Versionen: dann kein Knopf. */
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`element-${pathKey(path)}`}
      className={`rounded border p-2 ${problem ? "border-red-400" : "border-dashed border-zinc-300"}`}
      onDoubleClick={(e) => {
        // Innere Rahmen gehen vor: nur das Element unter dem Mauszeiger bearbeiten.
        e.stopPropagation();
        // Doppelklick auf Knöpfe (z. B. Pfeile eines Karussells) bearbeitet nicht.
        if (!(e.target as Element).closest("button")) onEdit?.();
      }}
    >
      <div className="not-prose mb-1 flex flex-wrap items-center gap-1 text-xs">
        <span className="font-medium text-zinc-500">{label}</span>
        {onEdit && (
          <button type="button" className={`${smallIconButton} ml-auto`} aria-label={`${label} bearbeiten`} title="Bearbeiten" onClick={onEdit}>
            <Icon d={EDIT_ICON} small />
          </button>
        )}
      </div>
      {problem && <p className="not-prose mb-1 text-xs text-red-600">{problem}</p>}
      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </div>
  );
}
