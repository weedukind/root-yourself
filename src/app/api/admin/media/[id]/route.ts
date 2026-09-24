import { db } from "@/db";
import { parseBody, parseId, toResponse } from "@/server/http";
import { deleteMedia, updateMedia } from "@/server/media/media";
import { getStorage } from "@/server/media/storage";
import { updateMediaInput } from "@/shared/api/media";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/media/[id]">) {
  const id = parseId((await ctx.params).id, "Bild");
  if (!id.ok) return toResponse(id);
  const input = await parseBody(request, updateMediaInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await updateMedia(db, getStorage(), id.value, input.value));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/media/[id]">) {
  const id = parseId((await ctx.params).id, "Bild");
  if (!id.ok) return toResponse(id);
  return toResponse(await deleteMedia(db, getStorage(), id.value), 204);
}
