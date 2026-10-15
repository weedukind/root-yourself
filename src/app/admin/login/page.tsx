import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, getKnownEmails } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden · rootyourself" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" ? next : "/admin";
  if (await getCurrentUser()) redirect("/admin");

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 text-zinc-900">
      <div className="w-full max-w-sm space-y-6 rounded border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-semibold">rootyourself · Admin</h1>
        <LoginForm next={target} knownEmails={await getKnownEmails()} />
      </div>
    </div>
  );
}
