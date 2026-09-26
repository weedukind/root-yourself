import { and, eq, max, notExists, sql } from "drizzle-orm";
import { cellElements, cells, elements, posts, rows, versions, versionTags } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PostDetail, VersionSummary } from "@/shared/api/posts";
import { getPost } from "../posts/posts";
import { conflict, notFound, ok, type Result } from "../result";

// Versionsbaum eines Posts (docs/concept.md, „Versionierung“). Jede Änderung sperrt den Post,
// damit Änderungen an einem Post nacheinander laufen – auch die Vergabe der Versionsnummer und
// die Prüfung „ist ein Blatt“.

type VersionRow = typeof versions.$inferSelect;

/** Sperrt den Post und lädt die Version; beide müssen zusammengehören. */
async function lockVersion(tx: Db, postId: string, versionId: string) {
  const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).for("update");
  if (!post) return undefined;
  const [version] = await tx
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.postId, postId)));
  return version ? { post, version } : undefined;
}

async function hasChildren(tx: Db, versionId: string): Promise<boolean> {
  const [child] = await tx
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.parentVersionId, versionId))
    .limit(1);
  return Boolean(child);
}

/** Löscht Elemente des Posts, die keine Version mehr verwendet. */
export async function deleteOrphanElements(tx: Db, postId: string): Promise<void> {
  await tx
    .delete(elements)
    .where(
      and(
        eq(elements.postId, postId),
        notExists(tx.select({ one: sql`1` }).from(cellElements).where(eq(cellElements.elementId, elements.id))),
      ),
    );
}

/**
 * Kopiert Rows, Zellen, Element-Verknüpfungen und Tags von einer Version in eine andere.
 * Die Elemente selbst werden nicht kopiert, sondern geteilt (Copy-on-Write).
 */
async function copyStructure(tx: Db, from: VersionRow, toVersionId: string): Promise<void> {
  const tagRows = await tx.select().from(versionTags).where(eq(versionTags.versionId, from.id));
  if (tagRows.length > 0) {
    await tx.insert(versionTags).values(tagRows.map(({ tagId }) => ({ versionId: toVersionId, tagId })));
  }

  const sourceRows = await tx.select().from(rows).where(eq(rows.versionId, from.id));
  if (sourceRows.length === 0) return;
  const newRows = await tx
    .insert(rows)
    .values(sourceRows.map(({ position, gridWidth, gridHeight }) => ({ versionId: toVersionId, position, gridWidth, gridHeight })))
    .returning();
  const rowIdByPosition = new Map(newRows.map((r) => [r.position, r.id]));
  const rowId = new Map(sourceRows.map((r) => [r.id, rowIdByPosition.get(r.position)!]));

  const sourceCells = await tx.select().from(cells).where(eq(cells.versionId, from.id));
  if (sourceCells.length === 0) return;
  const newCells = await tx
    .insert(cells)
    .values(
      sourceCells.map(({ rowId: oldRowId, position, width, height }) => ({
        versionId: toVersionId,
        rowId: rowId.get(oldRowId)!,
        position,
        width,
        height,
      })),
    )
    .returning();
  const cellIdByKey = new Map(newCells.map((c) => [`${c.rowId}:${c.position}`, c.id]));
  const cellId = new Map(sourceCells.map((c) => [c.id, cellIdByKey.get(`${rowId.get(c.rowId)}:${c.position}`)!]));

  const links = await tx.select().from(cellElements).where(eq(cellElements.versionId, from.id));
  if (links.length === 0) return;
  await tx.insert(cellElements).values(
    links.map(({ cellId: oldCellId, postId, position, elementId }) => ({
      cellId: cellId.get(oldCellId)!,
      versionId: toVersionId,
      postId,
      position,
      elementId,
    })),
  );
}

/** Forkt eine beliebige Version (auch eingefrorene). Die Quelle wird dadurch zum inneren Knoten. */
export async function forkVersion(db: Db, postId: string, versionId: string): Promise<Result<VersionSummary>> {
  const forkedId = await db.transaction(async (tx) => {
    const locked = await lockVersion(tx, postId, versionId);
    if (!locked) return undefined;
    const [{ highest }] = await tx
      .select({ highest: max(versions.number) })
      .from(versions)
      .where(eq(versions.postId, postId));
    const [fork] = await tx
      .insert(versions)
      .values({ postId, number: (highest ?? 0) + 1, parentVersionId: versionId, title: locked.version.title })
      .returning({ id: versions.id });
    await copyStructure(tx, locked.version, fork.id);
    return fork.id;
  });
  if (!forkedId) return notFound("Version");

  const post = await getPost(db, postId);
  if (!post.ok) return post;
  return ok(post.value.versions.find((v) => v.id === forkedId)!);
}

/** Veröffentlicht eine Version – auch eine ältere (Rollback). Höchstens eine ist veröffentlicht. */
export async function publishVersion(db: Db, postId: string, versionId: string): Promise<Result<PostDetail>> {
  const found = await db.transaction(async (tx) => {
    const locked = await lockVersion(tx, postId, versionId);
    if (!locked) return false;
    if (locked.post.publishedVersionId === versionId) return true;

    await tx.update(versions).set({ publishedAt: sql`clock_timestamp()` }).where(eq(versions.id, versionId));
    await tx
      .update(posts)
      .set({
        publishedVersionId: versionId,
        firstPublishedAt: sql`coalesce(${posts.firstPublishedAt}, clock_timestamp())`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(posts.id, postId));
    return true;
  });
  return found ? getPost(db, postId) : notFound("Version");
}

/** Zieht die Veröffentlichung zurück; alle Versionen bleiben erhalten. */
export async function unpublishPost(db: Db, postId: string): Promise<Result<PostDetail>> {
  const [row] = await db
    .update(posts)
    .set({ publishedVersionId: null, updatedAt: sql`clock_timestamp()` })
    .where(eq(posts.id, postId))
    .returning({ id: posts.id });
  return row ? getPost(db, postId) : notFound("Post");
}

/** Löscht ein unveröffentlichtes Blatt, nicht aber die letzte verbleibende Version. */
export async function deleteVersion(db: Db, postId: string, versionId: string): Promise<Result<null>> {
  return db.transaction(async (tx) => {
    const locked = await lockVersion(tx, postId, versionId);
    if (!locked) return notFound("Version");
    if (locked.post.publishedVersionId === versionId) {
      return conflict("version_published", "Die veröffentlichte Version kann nicht gelöscht werden");
    }
    if (await hasChildren(tx, versionId)) {
      return conflict("version_has_children", "Nur Versionen ohne Forks können gelöscht werden");
    }
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(versions)
      .where(eq(versions.postId, postId));
    if (count === 1) return conflict("last_version", "Die einzige Version eines Posts kann nicht gelöscht werden");

    await tx.delete(versions).where(eq(versions.id, versionId));
    await deleteOrphanElements(tx, postId);
    return ok(null);
  });
}
