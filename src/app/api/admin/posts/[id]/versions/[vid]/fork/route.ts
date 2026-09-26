import { db } from "@/db";
import { toResponse } from "@/server/http";
import { parseVersionPath } from "@/server/route-params";
import { forkVersion } from "@/server/versions/versions";

/** Forkt die Version; liefert die neue Version. */
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/posts/[id]/versions/[vid]/fork">) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  return toResponse(await forkVersion(db, path.value.postId, path.value.versionId), 201);
}
