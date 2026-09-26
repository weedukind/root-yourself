import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { createShareLink } from "@/server/public/preview";
import { parseVersionPath } from "@/server/route-params";
import { shareLinkInput } from "@/shared/api/posts";

/** Erzeugt einen teilbaren Vorschau-Link `{ days: 1 | 7 | 30 }` → `{ path, expiresAt }`. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/posts/[id]/versions/[vid]/preview-link">) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  const input = await parseBody(request, shareLinkInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await createShareLink(db, path.value.postId, path.value.versionId, input.value.days), 201);
}
