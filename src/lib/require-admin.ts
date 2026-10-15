import "server-only";
import type { SessionUser } from "@/server/auth/auth";
import { getCurrentUser } from "./session";

// Server Actions sind über jede Seiten-URL aufrufbar, nicht nur unter /admin.
// proxy.ts allein schützt sie daher nicht – jede Admin-Action ruft zuerst requireAdmin() auf.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht autorisiert");
  return user;
}
