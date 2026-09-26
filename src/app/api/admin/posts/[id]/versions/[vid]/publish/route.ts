import { db } from "@/db";
import { toResponse } from "@/server/http";
import { parseVersionPath } from "@/server/route-params";
import { publishVersion } from "@/server/versions/versions";

/** Veröffentlicht die Version (auch eine ältere: Rollback); liefert den Post. */
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/posts/[id]/versions/[vid]/publish">) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  return toResponse(await publishVersion(db, path.value.postId, path.value.versionId));
}
