import { db } from "@/db";
import { parseBody, parseId, toResponse } from "@/server/http";
import { deleteTag, updateTag } from "@/server/tags/tags";
import { updateTagInput } from "@/shared/api/tags";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/tags/[id]">) {
  const id = parseId((await ctx.params).id, "Tag");
  if (!id.ok) return toResponse(id);
  const input = await parseBody(request, updateTagInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await updateTag(db, id.value, input.value));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/tags/[id]">) {
  const id = parseId((await ctx.params).id, "Tag");
  if (!id.ok) return toResponse(id);
  return toResponse(await deleteTag(db, id.value), 204);
}
