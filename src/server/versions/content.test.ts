import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elements, media, tags, versions } from "@/db/schema";
import type { Db } from "@/db/types";
import { flattenElements } from "@/elements/schema";
import type { PostDetail } from "@/shared/api/posts";
import {
  type ElementInput,
  type ElementView,
  MAX_PAGE_ELEMENTS,
  type PageInput,
  saveVersionInput,
  type SaveVersionInput,
  type VersionDetail,
} from "@/shared/api/versions";
import { createFolder, withRollback } from "../../../test/db";
import { list, page, slide, text } from "../../../test/elements";
import { memoryStorage } from "../../../test/memory-storage";
import { createPost } from "../posts/posts";
import { getVersion, saveVersion } from "./content";
import { forkVersion, publishVersion } from "./versions";

const { storage } = memoryStorage();

// previewPath enthält ein Token mit Ablaufzeit aus new Date(). Läuft die Uhr zwischen Speichern
// und erneutem Laden über eine Zeitgrenze, unterscheiden sich die Tokens – daher Date anhalten
// (nur Date: Timer braucht der Datenbanktreiber).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function newPost(db: Db): Promise<PostDetail> {
  const result = await createPost(db, { title: "Wurzeln" });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function load(db: Db, postId: string, versionId: string): Promise<VersionDetail> {
  const result = await getVersion(db, storage, postId, versionId);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function inputOf(e: ElementView): ElementInput {
  const { id, type, data } = e;
  return {
    id,
    type,
    data,
    ...("mediaId" in e ? { mediaId: e.mediaId } : {}),
    ...("children" in e ? { children: e.children.map(inputOf) } : {}),
  } as ElementInput;
}

/** Eingabe aus einer geladenen Version – so, wie der Editor sie zurückschicken würde. */
function toInput(version: VersionDetail, patch: Partial<SaveVersionInput> = {}): SaveVersionInput {
  return {
    title: version.title,
    tagIds: version.tags.map((t) => t.id),
    root: inputOf(version.root) as PageInput,
    updatedAt: version.updatedAt,
    ...patch,
  };
}

/** Der Inhaltsbereich der Seite, eine Liste. */
const content = (version: VersionDetail) => version.root.children[0];
/** Neue Elemente im Inhaltsbereich; Seite und Inhaltsbereich bleiben dieselben. */
const withChildren = (version: VersionDetail, children: ElementInput[]) => page(children, version.root.id, content(version).id);

async function save(db: Db, postId: string, versionId: string, input: SaveVersionInput) {
  const result = await saveVersion(db, storage, postId, versionId, input);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** Legt v1 mit Inhalt an: Seite → [Liste → [Eins, Zwei], Drei]. */
async function furnished(db: Db) {
  const post = await newPost(db);
  const v1 = await load(db, post.id, post.versions[0].id);
  const saved = await save(db, post.id, v1.id, toInput(v1, { root: withChildren(v1, [list([text("Eins"), text("Zwei")]), text("Drei")]) }));
  return { post, v1: saved.version };
}

/** Inhalt der Seite: Texte als Markdown, Container als Liste ihrer Kinder. */
const tree = (version: VersionDetail) => {
  const shape = (items: ElementView[]): unknown[] =>
    items.map((e) => (e.type === "text" ? e.data.markdown : "children" in e ? shape(e.children) : e.type));
  return shape(content(version).children);
};
/** IDs der Texte in Lesereihenfolge. */
const textIds = (version: VersionDetail) =>
  flattenElements<ElementView>([version.root])
    .filter((e) => e.type === "text")
    .map((e) => e.id);
const elementCount = async (db: Db, postId: string) =>
  (await db.select({ id: elements.id }).from(elements).where(eq(elements.postId, postId))).length;

describe("createPost", () => {
  it("Version 1 hat eine Seite mit leerem Inhaltsbereich als Wurzel", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = await load(db, post.id, post.versions[0].id);
      expect(v1.root).toMatchObject({ type: "page", data: {}, children: [{ type: "list", data: { orientation: "vertical" }, children: [] }] });
    }));
});

describe("saveVersion – unveröffentlichtes Blatt", () => {
  it("speichert Titel, Tags und den Baum", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const [tag] = await db.insert(tags).values({ name: "Baum", slug: "baum" }).returning();
      const v1 = await load(db, post.id, post.versions[0].id);

      const { version, forkedFrom } = await save(
        db,
        post.id,
        v1.id,
        toInput(v1, {
          title: "Neuer Titel",
          tagIds: [tag.id],
          root: withChildren(v1, [list([text("A"), slide([text("B")])], "horizontal"), text("C")]),
        }),
      );
      expect(forkedFrom).toBeNull();
      expect(version).toMatchObject({ id: v1.id, title: "Neuer Titel", tags: [{ name: "Baum" }] });
      expect(tree(version)).toEqual([["A", ["B"]], "C"]);
      expect(content(version).children[0]).toMatchObject({ type: "list", data: { orientation: "horizontal" } });
      expect(version.root.id).toBe(v1.root.id);
      expect(version.updatedAt).not.toBe(v1.updatedAt);
      expect(await load(db, post.id, v1.id)).toEqual(version);
    }));

  it("unverändert zurückgeschickt entstehen keine neuen Elemente", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const { version } = await save(db, post.id, v1.id, toInput(v1));
      expect(textIds(version)).toEqual(textIds(v1));
      expect(await elementCount(db, post.id)).toBe(6); // Seite, Inhaltsbereich, Liste, drei Texte
    }));

  it("ändert nicht geteilte Elemente direkt – die ID bleibt; auch ein Typwechsel", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one, two, three] = textIds(v1);
      const listId = content(v1).children[0].id;
      const { version } = await save(
        db,
        post.id,
        v1.id,
        toInput(v1, {
          root: withChildren(v1, [
            list([text("Eins!", one), text("Zwei", two)], "vertical", listId),
            { id: three, type: "heading", data: { level: 2, text: "Drei" } },
          ]),
        }),
      );
      expect(textIds(version)).toEqual([one, two]);
      expect(tree(version)).toEqual([["Eins!", "Zwei"], "heading"]);
      expect(content(version).children[1]).toEqual({ id: three, type: "heading", data: { level: 2, text: "Drei" } });
      expect(await elementCount(db, post.id)).toBe(6);
    }));

  it("Umsortieren und Verschieben zwischen Containern erzeugen keine neuen Elemente", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const [one, two, three] = textIds(v1);
      const listId = content(v1).children[0].id;
      const { version } = await save(
        db,
        post.id,
        v1.id,
        toInput(v1, { root: withChildren(v1, [text("Drei", three), list([text("Eins", one)], "vertical", listId), text("Zwei", two)]) }),
      );
      expect(tree(version)).toEqual(["Drei", ["Eins"], "Zwei"]);
      expect(textIds(version)).toEqual([three, one, two]);
      expect(await elementCount(db, post.id)).toBe(6);
    }));

  it("entfernte, nicht geteilte Elemente werden aufgeräumt – ein Container samt Kindern", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const three = textIds(v1)[2];
      await save(db, post.id, v1.id, toInput(v1, { root: withChildren(v1, [text("Drei", three)]) }));
      expect(await elementCount(db, post.id)).toBe(3); // Seite, Inhaltsbereich und „Drei“
    }));

  it("liefert Bild-Elemente mit ihrem Medium", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const [image] = await db
        .insert(media)
        .values({ folderId: await createFolder(db), storageKey: "2026/09/bild.png", filename: "bild.png", mimeType: "image/png", sizeBytes: 1, width: 40, height: 30, alt: "Ein Bild" })
        .returning();
      const v1 = await load(db, post.id, post.versions[0].id);
      const { version } = await save(db, post.id, v1.id, toInput(v1, {
        root: withChildren(v1, [list([{ type: "image", data: { caption: "Unterschrift" }, mediaId: image.id }])]),
      }));
      const [container] = content(version).children;
      expect("children" in container && container.children[0]).toMatchObject({
        type: "image",
        data: { caption: "Unterschrift" },
        media: { id: image.id, url: "https://media.example/2026/09/bild.png", width: 40, alt: "Ein Bild", filename: "bild.png" },
      });
    }));
});

describe("saveVersion – geteilte Elemente (Copy-on-Write)", () => {
  it("klont ein geändertes geteiltes Element; Container und die übrigen Elemente bleiben geteilt", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      const [one, two, three] = textIds(v2);
      const listId = content(v2).children[0].id;

      const { version } = await save(
        db,
        post.id,
        v2.id,
        toInput(v2, { root: withChildren(v2, [list([text("Eins in v2", one), text("Zwei", two)], "vertical", listId), text("Drei", three)]) }),
      );
      const [newOne, sharedTwo, sharedThree] = textIds(version);
      expect(newOne).not.toBe(one);
      expect([sharedTwo, sharedThree]).toEqual([two, three]);
      expect(version.root.id).toBe(v1.root.id);
      expect(content(version).children[0].id).toBe(listId);
      expect(tree(await load(db, post.id, v1.id))).toEqual([["Eins", "Zwei"], "Drei"]);
      expect(await elementCount(db, post.id)).toBe(7);

      // Der Klon gehört nur v2 – eine weitere Änderung geht direkt in ihn.
      const again = await save(db, post.id, v2.id, toInput(version, { root: withChildren(version, [text("Eins, zweite Änderung", newOne)]) }));
      expect(textIds(again.version)).toEqual([newOne]);
    }));

  it("entfernte geteilte Elemente bleiben für die anderen Versionen erhalten", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      await save(db, post.id, v2.id, toInput(v2, { root: withChildren(v2, []) }));
      expect(await elementCount(db, post.id)).toBe(6);
      expect(tree(await load(db, post.id, v1.id))).toEqual([["Eins", "Zwei"], "Drei"]);
    }));
});

describe("saveVersion – veröffentlichte und eingefrorene Versionen", () => {
  it("veröffentlichte Version: Änderungen landen automatisch in einem Fork", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await publishVersion(db, post.id, v1.id);
      const published = await load(db, post.id, v1.id);
      const [one, two, three] = textIds(published);
      const listId = content(published).children[0].id;

      const { version, forkedFrom } = await save(
        db,
        post.id,
        v1.id,
        toInput(published, {
          title: "Überarbeitet",
          root: withChildren(published, [list([text("Eins!", one), text("Zwei", two)], "vertical", listId), text("Drei", three)]),
        }),
      );
      expect(forkedFrom).toBe(v1.id);
      expect(version).toMatchObject({ number: 2, parentVersionId: v1.id, title: "Überarbeitet", isEditable: true });
      const [newOne, sharedTwo, sharedThree] = textIds(version);
      expect(newOne).not.toBe(one);
      expect([sharedTwo, sharedThree]).toEqual([two, three]);
      expect(await load(db, post.id, v1.id)).toEqual({ ...published, isLeaf: false });
    }));

  it("lehnt eingefrorene innere Knoten ab und ändert nichts", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await forkVersion(db, post.id, v1.id);
      const result = await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "Geändert" }));
      expect(result).toMatchObject({ ok: false, error: { code: "version_frozen" } });
      expect((await load(db, post.id, v1.id)).title).toBe("Wurzeln");
    }));
});

describe("saveVersion – Fehler", () => {
  it("verhindert das Überschreiben einer zwischenzeitlichen Änderung", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      await save(db, post.id, v1.id, toInput(v1, { title: "Tab A" }));
      const result = await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "Tab B" }));
      expect(result).toMatchObject({ ok: false, error: { code: "version_conflict" } });
    }));

  it("lehnt Elemente anderer Versionen ab, ohne einen Fork übrig zu lassen", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      const forked = await forkVersion(db, post.id, v1.id);
      if (!forked.ok) throw new Error(forked.error.message);
      const v2 = await load(db, post.id, forked.value.id);
      const { version: v2saved } = await save(db, post.id, v2.id, toInput(v2, { root: withChildren(v2, [text("Nur v2")]) }));
      const foreignId = textIds(v2saved)[0];

      const sibling = await forkVersion(db, post.id, v1.id);
      if (!sibling.ok) throw new Error(sibling.error.message);
      await publishVersion(db, post.id, sibling.value.id);
      const v3 = await load(db, post.id, sibling.value.id);
      const result = await saveVersion(db, storage, post.id, v3.id, toInput(v3, { root: withChildren(v3, [text("x", foreignId)]) }));
      expect(result).toMatchObject({ ok: false, error: { code: "element_unknown" } });
      expect(await db.select().from(versions).where(eq(versions.postId, post.id))).toHaveLength(3);
    }));

  it("unbekannte Tags und Bilder: Fehler, und die Version bleibt unverändert", () =>
    withRollback(async (db) => {
      const { post, v1 } = await furnished(db);
      expect(
        await saveVersion(db, storage, post.id, v1.id, toInput(v1, { title: "X", tagIds: [crypto.randomUUID()] })),
      ).toMatchObject({ ok: false, error: { code: "tag_unknown" } });
      expect(
        await saveVersion(db, storage, post.id, v1.id, toInput(v1, {
          title: "X",
          root: withChildren(v1, [{ type: "image", data: {}, mediaId: crypto.randomUUID() }]),
        })),
      ).toMatchObject({ ok: false, error: { code: "media_unknown" } });
      expect(await load(db, post.id, v1.id)).toEqual(v1);
    }));

  it("meldet unbekannte Versionen", () =>
    withRollback(async (db) => {
      const post = await newPost(db);
      const v1 = await load(db, post.id, post.versions[0].id);
      expect(await saveVersion(db, storage, post.id, crypto.randomUUID(), toInput(v1))).toMatchObject({
        ok: false,
        error: { kind: "not_found" },
      });
    }));
});

describe("saveVersionInput", () => {
  const base = { title: "T", tagIds: [], updatedAt: new Date().toISOString() };
  const many = (n: number) => Array.from({ length: n }, () => text("x"));

  it("die Wurzel ist eine Seite mit genau einer Liste; darunter gibt es keine Seite", () => {
    expect(saveVersionInput.safeParse({ ...base, root: list([]) }).success).toBe(false);
    const bare = { type: "page", data: {} };
    expect(saveVersionInput.safeParse({ ...base, root: { ...bare, children: [] } }).success).toBe(false);
    expect(saveVersionInput.safeParse({ ...base, root: { ...bare, children: [text("x")] } }).success).toBe(false);
    expect(saveVersionInput.safeParse({ ...base, root: { ...bare, children: [list([]), list([])] } }).success).toBe(false);
    expect(saveVersionInput.safeParse({ ...base, root: page([page([]) as unknown as ElementInput]) }).success).toBe(false);
    expect(saveVersionInput.safeParse({ ...base, root: page([list([slide([text("tief")])])]) }).success).toBe(true);
  });

  it(`höchstens ${MAX_PAGE_ELEMENTS} Elemente pro Seite, Verschachteltes mitgezählt`, () => {
    // Seite + Inhaltsbereich + Liste + 297 Texte = 300: erlaubt; ein Text mehr: zu viel.
    expect(saveVersionInput.safeParse({ ...base, root: page([list(many(MAX_PAGE_ELEMENTS - 3))]) }).success).toBe(true);
    const tooMany = saveVersionInput.safeParse({ ...base, root: page([list(many(MAX_PAGE_ELEMENTS - 2))]) });
    expect(tooMany.error?.issues[0].message).toBe(`Höchstens ${MAX_PAGE_ELEMENTS} Elemente pro Seite`);
  });

  it("lehnt doppelt verwendete Elemente ab, auch in Containern", () => {
    const id = crypto.randomUUID();
    const result = saveVersionInput.safeParse({ ...base, root: page([slide([text("a", id)]), text("b", id)]) });
    expect(result.error?.issues[0].message).toBe("Element doppelt verwendet");
  });
});
