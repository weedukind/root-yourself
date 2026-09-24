import { db } from "@/db";
import { parseBody, toResponse } from "@/server/http";
import { confirmUpload, listMedia } from "@/server/media/media";
import { getStorage } from "@/server/media/storage";
import { ok } from "@/server/result";
import { createMediaInput } from "@/shared/api/media";

export async function GET() {
  return toResponse(ok(await listMedia(db, getStorage())));
}

/** Upload bestätigen: Die Datei liegt bereits im Speicher (siehe ./uploads). */
export async function POST(request: Request) {
  const input = await parseBody(request, createMediaInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await confirmUpload(db, getStorage(), input.value), 201);
}
