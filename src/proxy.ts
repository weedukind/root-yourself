import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getApiTokenUser } from "@/server/auth/api-tokens";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/auth";
import { errorResponse } from "@/server/http";

const LOGIN_PATH = "/admin/login";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === LOGIN_PATH) return;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await getSessionUser(db, token))) return;

  // Programme melden sich mit dem API-Token an, nur an der REST-API.
  const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (bearer && pathname.startsWith("/api/") && (await getApiTokenUser(db, bearer))) return;

  if (pathname.startsWith("/api/")) {
    return errorResponse({
      kind: "unauthorized",
      code: "unauthorized",
      message: "Nicht angemeldet. Bitte in einem neuen Tab unter /admin/login anmelden und erneut versuchen. Programme: API-Token prüfen.",
    });
  }
  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set("next", pathname + search);

  // Server Actions erwarten eine Action-Antwort; eine HTTP-Weiterleitung folgt fetch() still und
  // endet in „An unexpected response was received from the server“. Mit x-action-redirect
  // (so meldet Next.js externe Weiterleitungen aus Actions) lädt der Browser die Login-Seite.
  if (request.headers.has("next-action")) {
    return new Response(null, {
      headers: { "content-type": "text/plain", "x-action-redirect": `${login.pathname}${login.search};push` },
    });
  }
  // 303, damit ein abgeschicktes Formular als GET beim Login ankommt.
  return NextResponse.redirect(login, 303);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
