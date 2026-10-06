import { connection } from "next/server";
import { db } from "@/db";
import { toResponse } from "@/server/http";
import { getStorage } from "@/server/media/storage";
import { decodeCursor, findTag, listTeasers } from "@/server/public/feed";
import { invalid, notFound, ok } from "@/server/result";

/** Öffentlich: nächste Teaser einer Tag-Seite, `?after=<cursor>` aus der vorigen Antwort. */
export async function GET(request: Request, ctx: RouteContext<"/api/tags/[slug]/posts">) {
  await connection();
  const tag = await findTag(db, (await ctx.params).slug);
  if (!tag) return toResponse(notFound("Tag"));
  const after = new URL(request.url).searchParams.get("after");
  const cursor = after ? decodeCursor(after) : undefined;
  if (cursor === null) return toResponse(invalid("cursor_invalid", "Ungültiger Cursor", "after"));
  return toResponse(ok(await listTeasers(db, getStorage(), { after: cursor, tagId: tag.id })));
}
