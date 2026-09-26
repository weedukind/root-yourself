import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { getStorage } from "@/server/media/storage";
import { parseVersionPath } from "@/server/route-params";
import { getVersion, saveVersion } from "@/server/versions/content";
import { deleteVersion } from "@/server/versions/versions";
import { saveVersionInput } from "@/shared/api/versions";

type Context = RouteContext<"/api/admin/posts/[id]/versions/[vid]">;

/** Version vollständig: Titel, Tags, Layout mit Elementen. */
export async function GET(_request: Request, ctx: Context) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  return toResponse(await getVersion(db, getStorage(), path.value.postId, path.value.versionId));
}

/**
 * Speichert den vollständigen Stand. Ist die Version veröffentlicht, entsteht ein Fork –
 * die Antwort enthält dann die neue Version und `forkedFrom`.
 */
export async function PUT(request: Request, ctx: Context) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  const input = await parseBody(request, saveVersionInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await saveVersion(db, getStorage(), path.value.postId, path.value.versionId, input.value));
}

/** Löscht ein unveröffentlichtes Blatt. */
export async function DELETE(_request: Request, ctx: Context) {
  const path = parseVersionPath(await ctx.params);
  if (!path.ok) return toResponse(path);
  return toResponse(await deleteVersion(db, path.value.postId, path.value.versionId), 204);
}
