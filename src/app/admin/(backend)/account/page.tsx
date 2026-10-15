import type { Metadata } from "next";
import { db } from "@/db";
import { requireAdmin } from "@/lib/require-admin";
import { getApiTokenInfo } from "@/server/auth/api-tokens";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/auth";
import { ApiToken } from "./api-token";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Konto · Admin" };

export default async function AccountPage() {
  const user = await requireAdmin();
  const tokenInfo = await getApiTokenInfo(db, user.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Konto</h1>
        <p className="text-sm text-zinc-600">Angemeldet als {user.email}</p>
      </div>
      <section className="space-y-4 rounded border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Passwort ändern</h2>
        <PasswordForm email={user.email} minLength={PASSWORD_MIN_LENGTH} />
      </section>
      <section className="space-y-4 rounded border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">API-Token</h2>
        <ApiToken info={tokenInfo} now={new Date()} />
      </section>
    </div>
  );
}
