import { crc32, deflateSync } from "node:zlib";
import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test";

// Testdaten über die Admin-API anlegen und nach jedem Test wieder entfernen – auch wenn er
// fehlschlägt. Namen beginnen mit „E2E “, damit sie im Notfall leicht zu finden sind.

type Folder = { id: string; name: string };

class Scratch {
  private folders: string[] = [];
  private posts: string[] = [];
  private readonly suffix = Date.now().toString(36);

  constructor(private readonly request: APIRequestContext) {}

  name(base: string) {
    return `E2E ${base} ${this.suffix}`;
  }

  async folder(base: string, parentId: string | null = null): Promise<Folder> {
    const response = await this.request.post("/api/admin/media/folders", { data: { name: this.name(base), parentId } });
    expect(response.status()).toBe(201);
    const folder: Folder = await response.json();
    this.folders.push(folder.id);
    return folder;
  }

  async post(base: string): Promise<{ id: string; versionId: string }> {
    const response = await this.request.post("/api/admin/posts", { data: { title: this.name(base) } });
    expect(response.status()).toBe(201);
    const post = await response.json();
    this.posts.push(post.id);
    return { id: post.id, versionId: post.versions[0].id };
  }

  /** Einen im Test über die Oberfläche angelegten Ordner ebenfalls aufräumen. */
  track(folderId: string) {
    this.folders.push(folderId);
  }

  /** Bilder in einem Ordner (über die API, für Prüfungen). */
  async media(folderId: string): Promise<{ id: string; filename: string; alt: string }[]> {
    return (await this.request.get(`/api/admin/media?folder=${folderId}`)).json();
  }

  async cleanup() {
    for (const id of this.posts) await this.request.delete(`/api/admin/posts/${id}`);
    // Unterordner zuerst; Bilder vor ihrem Ordner.
    for (const id of [...this.folders].reverse()) {
      for (const m of await this.media(id)) await this.request.delete(`/api/admin/media/${m.id}`);
      await this.request.delete(`/api/admin/media/folders/${id}`);
    }
  }
}

export const test = base.extend<{ scratch: Scratch }>({
  // Der Parameter heißt bei Playwright sonst „use“ – das hält der React-Linter für einen Hook.
  // page.request teilt die Cookies der Seite (die Sitzung); das request-Fixture tut das nicht.
  scratch: async ({ page }, provide) => {
    const scratch = new Scratch(page.request);
    await provide(scratch);
    await scratch.cleanup();
  },
});

export { expect };

/** Einfarbiges PNG, ohne Bildbibliothek. */
export function png(width: number, height: number, [r, g, b]: [number, number, number] = [68, 170, 119]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Lädt Bilder über das Upload-Popup in den geöffneten Ordner hoch und wartet auf die Kacheln. */
export async function uploadImages(page: Page, files: { name: string; width?: number; height?: number }[]) {
  const before = await page.locator("main ul li img").count();
  await page.getByRole("button", { name: "Bilder hochladen" }).click();
  await page.getByLabel("Bilder auswählen").setInputFiles(
    files.map((f) => ({ name: f.name, mimeType: "image/png", buffer: png(f.width ?? 40, f.height ?? 30) })),
  );
  await expect(page.locator("main ul li img")).toHaveCount(before + files.length);
}
