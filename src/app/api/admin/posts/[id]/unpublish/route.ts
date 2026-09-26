import { db } from "@/db";
import { parseId, toResponse } from "@/server/http";
import { unpublishPost } from "@/server/versions/versions";

/** Zieht die Veröffentlichung zurück; liefert den Post. */
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/posts/[id]/unpublish">) {
  const id = parseId((await ctx.params).id, "Post");
  if (!id.ok) return toResponse(id);
  return toResponse(await unpublishPost(db, id.value));
}
