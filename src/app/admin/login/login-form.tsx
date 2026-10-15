"use client";

import { useActionState } from "react";
import { inputClass, primaryButton } from "../ui";
import { forgetEmails, login, type LoginState } from "./actions";

export function LoginForm({ next, knownEmails }: { next: string; knownEmails: string[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null, email: "" });
  const email = state.email || knownEmails[0] || "";

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">E-Mail</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            list={knownEmails.length > 0 ? "known-emails" : undefined}
            // Neu aufbauen, wenn die Vorbelegung wechselt (z. B. nach „vergessen“).
          key={email}
          defaultValue={email}
            autoFocus={!email}
            className={`${inputClass} w-full`}
          />
          {knownEmails.length > 0 && (
            <datalist id="known-emails">
              {knownEmails.map((known) => (
                <option key={known} value={known} />
              ))}
            </datalist>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Passwort</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            autoFocus={!!email}
            className={`${inputClass} w-full`}
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
          {pending ? "Anmelden …" : "Anmelden"}
        </button>
      </form>
      {knownEmails.length > 0 && (
        <form action={forgetEmails}>
          <button type="submit" className="text-xs text-zinc-500 underline hover:text-zinc-800">
            Gespeicherte E-Mail-Adressen in diesem Browser vergessen
          </button>
        </form>
      )}
    </div>
  );
}
