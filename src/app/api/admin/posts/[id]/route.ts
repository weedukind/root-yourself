import { db } from "@/db";
import { parseBody, parseId, toResponse } from "@/server/http";
import { changeSlug, deletePost, getPost } from "@/server/posts/posts";
import { updatePostInput } from "@/shared/api/posts";

type Context = RouteContext<"/api/admin/posts/[id]">;

export async function GET(_request: Request, ctx: Context) {
  const id = parseId((await ctx.params).id, "Post");
  if (!id.ok) return toResponse(id);
  return toResponse(await getPost(db, id.value));
}

/** Slug ändern (gilt für alle Versionen). */
export async function PATCH(request: Request, ctx: Context) {
  const id = parseId((await ctx.params).id, "Post");
  if (!id.ok) return toResponse(id);
  const input = await parseBody(request, updatePostInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await changeSlug(db, id.value, input.value));
}

export async function DELETE(_request: Request, ctx: Context) {
  const id = parseId((await ctx.params).id, "Post");
  if (!id.ok) return toResponse(id);
  return toResponse(await deletePost(db, id.value), 204);
}
