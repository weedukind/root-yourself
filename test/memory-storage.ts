import type { MediaStorage } from "@/server/media/storage";

// Speicher im Arbeitsspeicher für Tests. upload() spielt den PUT des Browsers nach.
export function memoryStorage() {
  const objects = new Map<string, { size: number; contentType: string }>();
  const storage: MediaStorage = {
    presignUpload: async (key, contentType, size) => `memory://${key}?type=${contentType}&size=${size}`,
    stat: async (key) => objects.get(key) ?? null,
    remove: async (key) => void objects.delete(key),
    publicUrl: (key) => `https://media.example/${key}`,
  };
  return {
    storage,
    objects,
    upload: (key: string, contentType: string, size: number) => objects.set(key, { size, contentType }),
  };
}
