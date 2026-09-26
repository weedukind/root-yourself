import { db } from "@/db";
import { toResponse } from "@/server/http";
import { parseVersionPath } from "@/server/route-params";
import { deleteVersion } from "@/server/versions/versions";

/** Löscht ein unveröffentlichtes Blatt. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/posts/[id]/versions/[vid]">) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  return toResponse(await deleteVersion(db, path.value.postId, path.value.versionId), 204);
}
