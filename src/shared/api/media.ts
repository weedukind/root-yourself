import { z } from "zod";

// Vertrag der Mediathek-Endpunkte unter /api/admin/media.

/** Erlaubte Bildtypen und ihre Dateiendung. SVG bewusst nicht: Es kann Skripte enthalten. */
export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const imageType = z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]], {
  error: "Nur JPEG, PNG, WebP, AVIF oder GIF",
});

const filename = z.string().trim().min(1).max(200);
const alt = z.string().trim().max(500, "Höchstens 500 Zeichen");

export const prepareUploadInput = z.object({
  filename,
  mimeType: imageType,
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Höchstens 20 MB"),
});

export const createMediaInput = z.object({
  key: z.string(),
  filename,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: alt.default(""),
});

export const updateMediaInput = z.object({
  alt,
  // Überschreib-Schutz: Stand, auf dem die Änderung beruht.
  updatedAt: z.iso.datetime(),
});

export type PrepareUploadInput = z.infer<typeof prepareUploadInput>;
export type CreateMediaInput = z.input<typeof createMediaInput>;
export type UpdateMediaInput = z.infer<typeof updateMediaInput>;

export type PreparedUpload = {
  key: string;
  uploadUrl: string;
  /** Header, die der PUT an uploadUrl genau so mitschicken muss (sie sind Teil der Signatur). */
  headers: Record<string, string>;
};

export type Media = {
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  alt: string;
  createdAt: string;
  updatedAt: string;
};

export type MediaWithUsage = Media & {
  /** Anzahl der Versionen, die das Bild verwenden – auch eingefrorene. */
  versionCount: number;
};
