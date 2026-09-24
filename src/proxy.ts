import type { NextRequest } from "next/server";
import { isAuthorized, unauthorizedResponse } from "@/lib/admin-auth";

export async function proxy(request: NextRequest) {
  if (!(await isAuthorized(request.headers.get("authorization")))) {
    return unauthorizedResponse();
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
