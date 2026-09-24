import { parseBody, toResponse } from "@/server/http";
import { prepareUpload } from "@/server/media/media";
import { getStorage } from "@/server/media/storage";
import { prepareUploadInput } from "@/shared/api/media";

/** Upload vorbereiten: liefert eine Presigned URL, an die der Browser die Datei direkt schickt. */
export async function POST(request: Request) {
  const input = await parseBody(request, prepareUploadInput);
  if (!input.ok) return toResponse(input);
  return toResponse(await prepareUpload(getStorage(), input.value), 201);
}
