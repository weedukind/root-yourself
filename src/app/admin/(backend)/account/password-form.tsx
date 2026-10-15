"use client";

import { useActionState } from "react";
import { inputClass, primaryButton } from "../../ui";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm({ email, minLength }: { email: string; minLength: number }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, { status: "idle" });

  return (
    <form action={action} className="max-w-sm space-y-4">
      {/* Für Passwort-Manager: das Konto, zu dem das neue Passwort gehört. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Aktuelles Passwort</span>
        <input type="password" name="currentPassword" required autoComplete="current-password" className={`${inputClass} w-full`} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Neues Passwort</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={minLength}
          autoComplete="new-password"
          className={`${inputClass} w-full`}
        />
        <span className="block text-xs text-zinc-500">Mindestens {minLength} Zeichen.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Neues Passwort wiederholen</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={minLength}
          autoComplete="new-password"
          className={`${inputClass} w-full`}
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "saved" && (
        <p role="status" className="text-sm text-green-700">
          Passwort geändert. Andere Anmeldungen wurden beendet.
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Speichern …" : "Passwort ändern"}
      </button>
    </form>
  );
}
