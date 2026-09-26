import { parseId } from "./http";
import type { Result } from "./result";

/** Post- und Versions-ID aus dem Pfad /api/admin/posts/[id]/versions/[vid]/… */
export function parseVersionPath(params: { id: string; vid: string }): Result<{ postId: string; versionId: string }> {
  const postId = parseId(params.id, "Post");
  if (!postId.ok) return postId;
  const versionId = parseId(params.vid, "Version");
  if (!versionId.ok) return versionId;
  return { ok: true, value: { postId: postId.value, versionId: versionId.value } };
}
