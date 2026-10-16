import { db } from "@/db";
import { parseBody, parseId, toResponse } from "@/server/http";
import { deleteFolder, updateFolder } from "@/server/media/folders";
import { updateFolderInput } from "@/shared/api/media";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/media/folders/[id]">) {
  const id = parseId((await ctx.params).id, "Ordner");
  if (!id.ok) return toResponse(id);
  const input = await parseBody(request, updateFolderInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await updateFolder(db, id.value, input.value));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/media/folders/[id]">) {
  const id = parseId((await ctx.params).id, "Ordner");
  if (!id.ok) return toResponse(id);
  return toResponse(await deleteFolder(db, id.value), 204);
}
