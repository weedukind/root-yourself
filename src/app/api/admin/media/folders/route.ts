import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { createFolder, listFolders } from "@/server/media/folders";
import { ok } from "@/server/result";
import { createFolderInput } from "@/shared/api/media";

export async function GET() {
  return toResponse(ok(await listFolders(db)));
}

export async function POST(request: Request) {
  const input = await parseBody(request, createFolderInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await createFolder(db, input.value), 201);
}
