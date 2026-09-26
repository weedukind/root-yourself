import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { createPost, listPosts } from "@/server/posts/posts";
import { ok } from "@/server/result";
import { createPostInput } from "@/shared/api/posts";

export async function GET() {
  return toResponse(ok(await listPosts(db)));
}

/** Legt einen Post mit Version 1 an. */
export async function POST(request: Request) {
  const input = await parseBody(request, createPostInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await createPost(db, input.value), 201);
}
