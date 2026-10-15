"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { endSession, forgetKnownEmails, rememberEmail, startSession } from "@/lib/session";
import { authenticate } from "@/server/auth/auth";

export type LoginState = { error: string | null; email: string };

/** Nur Pfade im Admin-Bereich, damit der Login nicht als offene Weiterleitung taugt. */
function safeNext(next: FormDataEntryValue | null): string {
  return typeof next === "string" && /^\/admin(\/|\?|$)/.test(next) ? next : "/admin";
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticate(db, email, password);
  if (!user) return { error: "E-Mail oder Passwort ist falsch.", email };

  await startSession(user.id);
  await rememberEmail(user.email);
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

export async function forgetEmails(): Promise<void> {
  await forgetKnownEmails();
}
