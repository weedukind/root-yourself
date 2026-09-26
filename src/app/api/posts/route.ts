import { connection } from "next/server";
import { db } from "@/db";
import { toResponse } from "@/server/http";
import { getStorage } from "@/server/media/storage";
import { decodeCursor, listTeasers } from "@/server/public/feed";
import { invalid, ok } from "@/server/result";

/** Öffentlich: nächste Teaser der Startseite, `?after=<cursor>` aus der vorigen Antwort. */
export async function GET(request: Request) {
  await connection();
  const after = new URL(request.url).searchParams.get("after");
  const cursor = after ? decodeCursor(after) : undefined;
  if (cursor === null) return toResponse(invalid("cursor_invalid", "Ungültiger Cursor", "after"));
  return toResponse(ok(await listTeasers(db, getStorage(), { after: cursor })));
}
