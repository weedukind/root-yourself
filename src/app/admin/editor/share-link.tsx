"use client";

import { useState } from "react";
import type { ApiError } from "@/shared/api/errors";
import type { ShareLink } from "@/shared/api/posts";
import { api } from "../api-client";
import { ErrorText, formatDateTime, inputClass, secondaryButton } from "../ui";

// Teilbarer Vorschau-Link: gilt nur für diese Version und nur bis zum Ablauf; Empfänger
// brauchen keinen Admin-Zugang.

const DAYS = [
  { days: 1, label: "1 Tag" },
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
] as const;

export function ShareLinkPanel({ postId, versionId }: { postId: string; versionId: string }) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const url = link ? `${window.location.origin}${link.path}` : "";

  async function create() {
    setBusy(true);
    const result = await api<ShareLink>(`/posts/${postId}/versions/${versionId}/preview-link`, {
      method: "POST",
      body: { days },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setCopied(false);
    setLink(result.value);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Ohne Zugriff auf die Zwischenablage bleibt der Link im Feld markierbar.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 rounded border border-zinc-200 bg-white p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Vorschau-Link teilen</span>
        <label className="flex items-center gap-1 text-zinc-600">
          gültig
          <select className={inputClass} value={days} onChange={(e) => setDays(Number(e.target.value) as 1 | 7 | 30)}>
            {DAYS.map((d) => (
              <option key={d.days} value={d.days}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={secondaryButton} onClick={create} disabled={busy}>
          Link erzeugen
        </button>
      </div>
      {link && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              aria-label="Vorschau-Link"
              className={`${inputClass} min-w-0 flex-1 font-mono text-xs`}
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className={secondaryButton} onClick={copy}>
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Gültig bis {formatDateTime(link.expiresAt)}, nur für diese Version. Wer den Link hat, sieht jeden gespeicherten
            Stand dieser Version.
          </p>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
