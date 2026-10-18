import { and, asc, countDistinct, eq, inArray, max, sql } from "drizzle-orm";
import { elements, media, tags, versionElements, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import { childrenOf, ELEMENT_SCHEMAS, isContainer, isElementType } from "@/elements/schema";
import { byName } from "@/lib/sort";
import type {
  ElementInput,
  ElementView,
  SaveVersionInput,
  SaveVersionResult,
  VersionDetail,
} from "@/shared/api/versions";
import { foreignKeyConstraint } from "../db-errors";
import type { MediaStorage } from "../media/storage";
import { getPost } from "../posts/posts";
import { conflict, invalid, notFound, ok, type Result } from "../result";
import { deleteOrphanElements, hasChildren, lockVersion } from "./versions";

// Inhalt einer Version laden und speichern (docs/concept.md, „Speichern eines Blatts im Detail“).

type ElementRow = typeof elements.$inferSelect;
type MediaRow = typeof media.$inferSelect;

function toElementView(row: ElementRow, medium: MediaRow | null, storage: MediaStorage): ElementView {
  if (!isElementType(row.type)) throw new Error(`Unbekannter Elementtyp ${row.type}`);
  const element = { id: row.id, type: row.type, data: row.data, ...(isContainer(row.type) ? { children: [] } : {}) };
  // Ob ein Typ ein Bild hat, sichert die Datenbank (elements_media_check, siehe ELEMENT_SCHEMAS).
  if (!ELEMENT_SCHEMAS[row.type].media) return element as ElementView;
  return {
    ...element,
    mediaId: row.mediaId!,
    media: {
      id: medium!.id,
      url: storage.publicUrl(medium!.storageKey),
      width: medium!.width,
      height: medium!.height,
      alt: medium!.alt,
    },
  } as ElementView;
}

export async function getVersion(
  db: Db,
  storage: MediaStorage,
  postId: string,
  versionId: string,
): Promise<Result<VersionDetail>> {
  const post = await getPost(db, postId);
  if (!post.ok) return post;
  const summary = post.value.versions.find((v) => v.id === versionId);
  if (!summary) return notFound("Version");

  const [tagRows, links] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(versionTags)
      .innerJoin(tags, eq(tags.id, versionTags.tagId))
      .where(eq(versionTags.versionId, versionId)),
    db
      .select({ link: versionElements, element: elements, medium: media })
      .from(versionElements)
      .innerJoin(elements, eq(elements.id, versionElements.elementId))
      .leftJoin(media, eq(media.id, elements.mediaId))
      .where(eq(versionElements.versionId, versionId))
      .orderBy(asc(versionElements.position)),
  ]);

  // Elemente als Baum: Kinder hängen am Container (parent_element_id), Positionen je Elternteil.
  const views = new Map(links.map((l) => [l.link.elementId, toElementView(l.element, l.medium, storage)]));
  for (const { link } of links) {
    const parent = link.parentElementId ? views.get(link.parentElementId) : undefined;
    if (parent) childrenOf(parent).push(views.get(link.elementId)!);
  }
  const rootLink = links.find((l) => !l.link.parentElementId);
  const root = rootLink && views.get(rootLink.link.elementId);
  // Jede Version hat eine Seite als Wurzel (createPost, saveVersion, forkVersion).
  if (root?.type !== "page") throw new Error(`Version ${versionId} hat keine Seite als Wurzel`);

  const published = post.value.publishedVersion;
  return ok({
    ...summary,
    postId,
    postSlug: post.value.slug,
    postPublishedVersion: published && { id: published.id, number: published.number },
    postFirstPublishedAt: post.value.firstPublishedAt,
    tags: tagRows.sort(byName),
    root,
  });
}

/** JSON mit sortierten Schlüsseln: jsonb liefert Objekte nicht in der gespeicherten Reihenfolge. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const elementValues = (element: ElementInput) => ({
  type: element.type,
  data: element.data,
  mediaId: "mediaId" in element ? element.mediaId : null,
});

function unchanged(row: ElementRow, values: ReturnType<typeof elementValues>): boolean {
  return row.type === values.type && row.mediaId === values.mediaId && stableJson(row.data) === stableJson(values.data);
}

/**
 * Speichert den vollständigen Stand einer Version.
 * - Nur unveröffentlichte Blätter werden direkt geändert.
 * - Ist die Version veröffentlicht, entsteht automatisch ein Fork mit den Änderungen.
 * - Versionen mit Forks sind eingefroren.
 * - Geänderte Elemente werden direkt geändert, wenn nur diese Version sie nutzt, sonst geklont.
 */
export async function saveVersion(
  db: Db,
  storage: MediaStorage,
  postId: string,
  versionId: string,
  input: SaveVersionInput,
): Promise<Result<SaveVersionResult>> {
  let outcome: Result<{ targetId: string; forkedFrom: string | null }>;
  try {
    outcome = await db.transaction(async (tx) => {
      const locked = await lockVersion(tx, postId, versionId);
      if (!locked) return notFound("Version");
      const { post, version } = locked;

      if (version.updatedAt.getTime() !== new Date(input.updatedAt).getTime()) {
        return conflict("version_conflict", "Die Version wurde inzwischen geändert. Bitte neu laden.");
      }
      if (await hasChildren(tx, versionId)) {
        return conflict("version_frozen", "Diese Version hat Forks und ist eingefroren. Zum Weiterarbeiten forken.");
      }

      // Bestehende Elemente dürfen nur aus dieser Version stammen. Vor dem Fork prüfen, damit
      // bei einem Fehler kein leerer Fork übrig bleibt.
      const placed = placeElements(input);
      const inputElements = placed.map((p) => p.element);
      const sourceLinks = await tx
        .select({ elementId: versionElements.elementId })
        .from(versionElements)
        .where(eq(versionElements.versionId, versionId));
      const sourceIds = new Set(sourceLinks.map((l) => l.elementId));
      if (inputElements.some((e) => e.id && !sourceIds.has(e.id))) {
        return invalid("element_unknown", "Ein Element gehört nicht zu dieser Version", "root");
      }

      // Veröffentlichte Version: Sie bleibt unverändert, die Änderungen gehen in einen Fork.
      let targetId = versionId;
      let forkedFrom: string | null = null;
      if (post.publishedVersionId === versionId) {
        const [{ highest }] = await tx
          .select({ highest: max(versions.number) })
          .from(versions)
          .where(eq(versions.postId, postId));
        const [fork] = await tx
          .insert(versions)
          .values({ postId, number: (highest ?? 0) + 1, parentVersionId: versionId, title: input.title })
          .returning({ id: versions.id });
        targetId = fork.id;
        forkedFrom = versionId;
      }

      // Copy-on-Write für Elemente.
      const ids = [...sourceIds];
      const existing = new Map(
        ids.length ? (await tx.select().from(elements).where(inArray(elements.id, ids))).map((e) => [e.id, e]) : [],
      );
      const usage = new Map(
        ids.length
          ? (
              await tx
                .select({ elementId: versionElements.elementId, versions: countDistinct(versionElements.versionId) })
                .from(versionElements)
                .where(inArray(versionElements.elementId, ids))
                .groupBy(versionElements.elementId)
            ).map((u) => [u.elementId, u.versions])
          : [],
      );

      const resolvedIds: string[] = [];
      for (const element of inputElements) {
        const values = elementValues(element);
        const row = element.id ? existing.get(element.id) : undefined;
        if (row && unchanged(row, values)) {
          resolvedIds.push(row.id);
        } else if (row && targetId === versionId && usage.get(row.id) === 1) {
          // Nur diese Version nutzt das Element: direkt ändern.
          // clock_timestamp() statt now(): now() ist innerhalb einer Transaktion konstant.
          await tx.update(elements).set({ ...values, updatedAt: sql`clock_timestamp()` }).where(eq(elements.id, row.id));
          resolvedIds.push(row.id);
        } else {
          // Neu, oder geändert und mit anderen Versionen geteilt: neues Element.
          const [created] = await tx.insert(elements).values({ postId, ...values }).returning({ id: elements.id });
          resolvedIds.push(created.id);
        }
      }

      // Baum und Tags der Zielversion neu schreiben (Strukturdaten ohne Inhalt).
      await tx.delete(versionElements).where(eq(versionElements.versionId, targetId));
      await tx.delete(versionTags).where(eq(versionTags.versionId, targetId));
      await writeTree(tx, postId, targetId, placed, resolvedIds);
      if (input.tagIds.length > 0) {
        await tx.insert(versionTags).values(input.tagIds.map((tagId) => ({ versionId: targetId, tagId })));
      }

      await tx
        .update(versions)
        .set({ title: input.title, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(versions.id, targetId), eq(versions.postId, postId)));
      await deleteOrphanElements(tx, postId);
      return ok({ targetId, forkedFrom });
    });
  } catch (error) {
    switch (foreignKeyConstraint(error)) {
      case "version_tags_tag_id_tags_id_fk":
        return invalid("tag_unknown", "Ein angegebener Tag existiert nicht", "tagIds");
      case "elements_media_id_media_id_fk":
        return invalid("media_unknown", "Ein angegebenes Bild existiert nicht", "root");
    }
    throw error;
  }

  if (!outcome.ok) return outcome;
  const saved = await getVersion(db, storage, postId, outcome.value.targetId);
  if (!saved.ok) return saved;
  return ok({ version: saved.value, forkedFrom: outcome.value.forkedFrom });
}

/** Ein Element der Eingabe mit seinem Platz: Elternteil (Index in der Liste, null: Wurzel) und Position. */
type Placed = { element: ElementInput; parent: number | null; position: number };

/** Alle Elemente des Baums in Lesereihenfolge, Elternteil vor seinen Kindern; die Seite zuerst. */
function placeElements(input: SaveVersionInput): Placed[] {
  const placed: Placed[] = [];
  const visit = (element: ElementInput, parent: number | null, position: number) => {
    placed.push({ element, parent, position });
    const index = placed.length - 1;
    childrenOf(element).forEach((child, i) => visit(child, index, i));
  };
  visit(input.root, null, 0);
  return placed;
}

/** Schreibt die Verknüpfungen des Baums; die Reihenfolge der Kinder ergibt die Positionen. */
async function writeTree(tx: Db, postId: string, versionId: string, placed: Placed[], elementIds: string[]): Promise<void> {
  await tx.insert(versionElements).values(
    placed.map((p, i) => ({
      versionId,
      postId,
      elementId: elementIds[i],
      parentElementId: p.parent === null ? null : elementIds[p.parent],
      position: p.position,
    })),
  );
}
