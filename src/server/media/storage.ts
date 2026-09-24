import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Bildspeicher über die S3-API: Cloudflare R2 in Produktion, RustFS lokal (docker-compose.dev.yml).
// Als Schnittstelle, damit Tests ohne echten Speicher auskommen.

export interface MediaStorage {
  /** Signierte URL für genau einen PUT mit diesem Typ und dieser Größe. */
  presignUpload(key: string, contentType: string, size: number): Promise<string>;
  /** Größe und Typ eines hochgeladenen Objekts, oder null, wenn es nicht existiert. */
  stat(key: string): Promise<{ size: number; contentType: string } | null>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ist nicht gesetzt`);
  return value;
}

export function createS3Storage(): MediaStorage {
  const bucket = env("S3_BUCKET");
  const publicBase = env("MEDIA_PUBLIC_URL").replace(/\/+$/, "");
  const config = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "auto",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
    });
  const client = config(env("S3_ENDPOINT"));
  // Die Signatur enthält den Host. Lokal erreicht der Browser den Speicher unter einer anderen
  // Adresse als der Server im Container; bei R2 sind beide gleich.
  const presigner = config(process.env.S3_PUBLIC_ENDPOINT ?? env("S3_ENDPOINT"));

  return {
    presignUpload: (key, contentType, size) =>
      getSignedUrl(
        presigner,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }),
        // Ohne diese Angabe unterschreibt das SDK Typ und Größe nicht mit – der Browser könnte dann
        // eine beliebige Datei hochladen.
        { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
      ),

    async stat(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    publicUrl: (key) => `${publicBase}/${key}`,
  };
}

let storage: MediaStorage | undefined;

export const getStorage = () => (storage ??= createS3Storage());
