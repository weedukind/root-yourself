import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { ok } from "@/server/result";
import { createTag, listTags } from "@/server/tags/tags";
import { createTagInput } from "@/shared/api/tags";

export async function GET() {
  return toResponse(ok(await listTags(db)));
}

export async function POST(request: Request) {
  const input = await parseBody(request, createTagInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await createTag(db, input.value), 201);
}
