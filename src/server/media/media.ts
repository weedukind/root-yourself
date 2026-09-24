import { and, countDistinct, desc, eq, sql } from "drizzle-orm";
import { cellElements, elements, media } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type CreateMediaInput,
  type Media,
  type MediaWithUsage,
  type PreparedUpload,
  type PrepareUploadInput,
  type UpdateMediaInput,
} from "@/shared/api/media";
import { restrictViolation, uniqueViolation } from "../db-errors";
import { conflict, invalid, notFound, ok, type Result } from "../result";
import type { MediaStorage } from "./storage";

// Ablauf eines Uploads (docs/concept.md, „Mediathek“):
// 1. prepareUpload: Schlüssel vergeben, Presigned URL erzeugen
// 2. Browser lädt die Datei direkt in den Speicher (nicht durch die App – Vercel begrenzt Bodies auf 4,5 MB)
// 3. confirmUpload: Datei im Speicher prüfen, erst dann den Datenbankeintrag anlegen

type MediaRow = typeof media.$inferSelect;

// Nur Schlüssel, die prepareUpload vergeben haben kann – sonst ließen sich fremde Objekte registrieren.
const KEY_PATTERN = new RegExp(
  `^\\d{4}/\\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.values(IMAGE_TYPES).join("|")})$`,
);

const toMedia = (row: MediaRow, storage: MediaStorage): Media => ({
  id: row.id,
  key: row.storageKey,
  url: storage.publicUrl(row.storageKey),
  filename: row.filename,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  width: row.width,
  height: row.height,
  alt: row.alt,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function prepareUpload(
  storage: MediaStorage,
  input: PrepareUploadInput,
  now = new Date(),
): Promise<Result<PreparedUpload>> {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.${IMAGE_TYPES[input.mimeType]}`;
  const uploadUrl = await storage.presignUpload(key, input.mimeType, input.size);
  return ok({ key, uploadUrl, headers: { "content-type": input.mimeType } });
}

export async function confirmUpload(
  db: Db,
  storage: MediaStorage,
  input: CreateMediaInput,
): Promise<Result<Media>> {
  if (!KEY_PATTERN.test(input.key)) return invalid("key_invalid", "Unbekannter Upload-Schlüssel", "key");

  // Größe und Typ aus dem Speicher, nicht aus der Anfrage.
  const object = await storage.stat(input.key);
  if (!object) return invalid("upload_missing", "Die Datei wurde nicht (vollständig) hochgeladen", "key");
  if (!(object.contentType in IMAGE_TYPES) || object.size > MAX_UPLOAD_BYTES) {
    await storage.remove(input.key);
    return invalid("upload_invalid", "Die hochgeladene Datei ist kein erlaubtes Bild", "key");
  }

  try {
    // Eigene (Unter-)Transaktion: Eine Regelverletzung macht sonst eine umgebende Transaktion unbrauchbar.
    const [row] = await db.transaction((tx) =>
      tx
        .insert(media)
        .values({
          storageKey: input.key,
          filename: input.filename,
          mimeType: object.contentType,
          sizeBytes: object.size,
          width: input.width,
          height: input.height,
          alt: input.alt ?? "",
        })
        .returning(),
    );
    return ok(toMedia(row, storage));
  } catch (error) {
    if (uniqueViolation(error) === "media_storage_key_unique") {
      return conflict("already_registered", "Diese Datei ist bereits in der Mediathek", "key");
    }
    throw error;
  }
}

export async function listMedia(db: Db, storage: MediaStorage): Promise<MediaWithUsage[]> {
  const rows = await db
    .select({ media, versionCount: countDistinct(cellElements.versionId) })
    .from(media)
    .leftJoin(elements, eq(elements.mediaId, media.id))
    .leftJoin(cellElements, eq(cellElements.elementId, elements.id))
    .groupBy(media.id)
    .orderBy(desc(media.createdAt), desc(media.id));

  return rows.map((r) => ({ ...toMedia(r.media, storage), versionCount: r.versionCount }));
}

export async function updateMedia(
  db: Db,
  storage: MediaStorage,
  id: string,
  input: UpdateMediaInput,
): Promise<Result<Media>> {
  // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
  const [row] = await db
    .update(media)
    .set({ alt: input.alt, updatedAt: sql`clock_timestamp()` })
    .where(and(eq(media.id, id), eq(media.updatedAt, new Date(input.updatedAt))))
    .returning();
  if (row) return ok(toMedia(row, storage));

  const [exists] = await db.select({ id: media.id }).from(media).where(eq(media.id, id));
  return exists ? conflict("stale", "Das Bild wurde inzwischen geändert. Bitte neu laden.") : notFound("Bild");
}

export async function deleteMedia(db: Db, storage: MediaStorage, id: string): Promise<Result<null>> {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row) return notFound("Bild");

  const inUse = () =>
    conflict("media_in_use", "Das Bild wird noch verwendet und kann nicht gelöscht werden");

  // Verwendet heißt: Irgendein Element verweist darauf. Elemente ohne Version räumt das Backend
  // sofort auf, jedes vorhandene Element gehört also zu mindestens einer Version.
  const [usage] = await db.select({ id: elements.id }).from(elements).where(eq(elements.mediaId, id)).limit(1);
  if (usage) return inUse();

  try {
    // Die Datenbank schützt zusätzlich (ON DELETE RESTRICT), falls parallel ein Element entsteht.
    await db.transaction((tx) => tx.delete(media).where(eq(media.id, id)));
  } catch (error) {
    if (restrictViolation(error)) return inUse();
    throw error;
  }

  // Erst nach dem Datenbankeintrag die Datei: Scheitert das, bleibt nur eine verwaiste Datei,
  // aber kein Eintrag, der auf eine fehlende Datei zeigt.
  try {
    await storage.remove(row.storageKey);
  } catch (error) {
    console.error(`Datei ${row.storageKey} konnte nicht gelöscht werden`, error);
  }
  return ok(null);
}
