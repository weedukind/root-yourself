import { db } from "@/db";
import { parseBody, toResponse, validate } from "@/server/http";
import { confirmUpload, listMedia } from "@/server/media/media";
import { getStorage } from "@/server/media/storage";
import { ok } from "@/server/result";
import { createMediaInput, listMediaQuery } from "@/shared/api/media";

/** Mediathek, optional gefiltert: ?tag=<id> */
export async function GET(request: Request) {
  const query = validate(listMediaQuery, Object.fromEntries(new URL(request.url).searchParams));
  if (!query.ok) return toResponse(query);
  return toResponse(ok(await listMedia(db, getStorage(), { tagId: query.value.tag })));
}

/** Upload bestätigen: Die Datei liegt bereits im Speicher (siehe ./uploads). */
export async function POST(request: Request) {
  const input = await parseBody(request, createMediaInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await confirmUpload(db, getStorage(), input.value), 201);
}
