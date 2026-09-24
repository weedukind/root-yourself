import "server-only";
import { headers } from "next/headers";
import { isAuthorized } from "./admin-auth";

// Server Actions sind über jede Seiten-URL aufrufbar, nicht nur unter /admin.
// proxy.ts allein schützt sie daher nicht – jede Admin-Action ruft zuerst requireAdmin() auf.
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthorized((await headers()).get("authorization")))) {
    throw new Error("Nicht autorisiert");
  }
}
