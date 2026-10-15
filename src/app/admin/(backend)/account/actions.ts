"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/lib/require-admin";
import { getSessionToken } from "@/lib/session";
import { createApiToken, deleteApiToken } from "@/server/auth/api-tokens";
import { changePassword } from "@/server/auth/auth";

export type PasswordState = { status: "idle" | "saved" } | { status: "error"; message: string };

export async function changePasswordAction(_state: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireAdmin();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (newPassword !== formData.get("confirmPassword")) {
    return { status: "error", message: "Die beiden neuen Passwörter stimmen nicht überein." };
  }

  const result = await changePassword(db, user.id, { currentPassword, newPassword }, (await getSessionToken())!);
  return result.ok ? { status: "saved" } : { status: "error", message: result.error.message };
}

export type ApiTokenState = { token: string; createdAt: Date; expiresAt: Date } | null;

/** Der Klartext geht nur in dieser Antwort an den Browser und wird nirgends gespeichert. */
export async function createApiTokenAction(): Promise<ApiTokenState> {
  const user = await requireAdmin();
  const created = await createApiToken(db, user.id);
  revalidatePath("/admin/account");
  return created;
}

export async function deleteApiTokenAction(): Promise<void> {
  const user = await requireAdmin();
  await deleteApiToken(db, user.id);
  revalidatePath("/admin/account");
}
