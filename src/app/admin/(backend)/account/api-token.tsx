"use client";

import { useActionState, useState } from "react";
import type { ApiTokenInfo } from "@/server/auth/api-tokens";
import { formatDate, formatDateTime } from "@/lib/format";
import { dangerButton, primaryButton, secondaryButton } from "../../ui";
import { createApiTokenAction, deleteApiTokenAction, type ApiTokenState } from "./actions";

export function ApiToken({ info, now }: { info: ApiTokenInfo | null; now: Date }) {
  const [created, action, pending] = useActionState<ApiTokenState>(createApiTokenAction, null);
  const [copied, setCopied] = useState(false);
  // Nur zeigen, solange er der gespeicherte Token ist – nach dem Löschen nicht mehr.
  const shown = created && info?.createdAt.getTime() === created.createdAt.getTime() ? created : null;

  function confirmReplace(event: React.FormEvent) {
    const question = "Der bisherige Token wird sofort ungültig. Programme, die ihn nutzen, brauchen den neuen. Fortfahren?";
    if (info && !window.confirm(question)) event.preventDefault();
    setCopied(false);
  }

  function confirmDelete(event: React.FormEvent) {
    const question = "Token löschen? Programme, die ihn nutzen, werden sofort abgewiesen.";
    if (!window.confirm(question)) event.preventDefault();
  }

  async function copy() {
    if (!shown) return;
    await navigator.clipboard.writeText(shown.token);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Für Skripte und andere Programme: Anfragen an <code>/api/admin/…</code> mit dem Header{" "}
        <code>Authorization: Bearer &lt;Token&gt;</code>. Ein Token gilt ein Jahr. Es gibt höchstens einen; ein neuer
        ersetzt den alten.
      </p>

      {shown ? (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Jetzt kopieren: Der Token wird nur dieses eine Mal angezeigt. Gültig bis {formatDate(shown.expiresAt)}.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-sm">{shown.token}</code>
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </div>
      ) : !info ? (
        <p className="text-sm">Kein Token vorhanden.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Erzeugt</dt>
          <dd>{formatDateTime(info.createdAt)}</dd>
          <dt className="text-zinc-500">{info.expiresAt <= now ? "Abgelaufen" : "Gültig bis"}</dt>
          <dd className={info.expiresAt <= now ? "text-red-600" : undefined}>{formatDate(info.expiresAt)}</dd>
          <dt className="text-zinc-500">Zuletzt benutzt</dt>
          <dd>{info.lastUsedAt ? formatDateTime(info.lastUsedAt) : "noch nie"}</dd>
        </dl>
      )}

      <div className="flex gap-2">
        <form action={action} onSubmit={confirmReplace}>
          <button type="submit" disabled={pending} className={info ? secondaryButton : primaryButton}>
            {pending ? "Erzeuge …" : info ? "Neuen Token erzeugen" : "Token erzeugen"}
          </button>
        </form>
        {info && (
          <form action={deleteApiTokenAction} onSubmit={confirmDelete}>
            <button type="submit" className={dangerButton}>
              Token löschen
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
