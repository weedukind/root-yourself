import { describe, expect, it } from "vitest";
import type { MediaFolder } from "@/shared/api/media";
import { canMoveFolder, childrenOf, folderOptions, pathLabel, pathOf, subtreeIds } from "./media-folders";

const f = (id: string, name: string, parentId: string | null = null): MediaFolder => ({
  id,
  name,
  parentId,
  mediaCount: 0,
  folderCount: 0,
  createdAt: "",
  updatedAt: "",
});

// Reisen / Island / Nord, Reisen / Äland, Wald
const folders = [f("w", "Wald"), f("r", "Reisen"), f("i", "Island", "r"), f("n", "Nord", "i"), f("a", "Äland", "r")];

describe("Ordnerbaum", () => {
  it("childrenOf sortiert deutsch", () => {
    expect(childrenOf(folders, null).map((x) => x.name)).toEqual(["Reisen", "Wald"]);
    expect(childrenOf(folders, "r").map((x) => x.name)).toEqual(["Äland", "Island"]);
  });

  it("pathOf und pathLabel gehen von oben bis zum Ordner", () => {
    expect(pathOf(folders, "n").map((x) => x.id)).toEqual(["r", "i", "n"]);
    expect(pathLabel(folders, "n")).toBe("Reisen / Island / Nord");
    expect(pathOf(folders, null)).toEqual([]);
    expect(pathOf(folders, "unbekannt")).toEqual([]);
  });

  it("subtreeIds umfasst den Ordner und alle darunter", () => {
    expect([...subtreeIds(folders, "r")].sort()).toEqual(["a", "i", "n", "r"]);
    expect([...subtreeIds(folders, "w")]).toEqual(["w"]);
  });

  it("folderOptions in Baumreihenfolge, ohne ausgeschlossene Zweige", () => {
    expect(folderOptions(folders).map((o) => o.label)).toEqual([
      "Reisen",
      "Reisen / Äland",
      "Reisen / Island",
      "Reisen / Island / Nord",
      "Wald",
    ]);
    expect(folderOptions(folders, subtreeIds(folders, "i")).map((o) => o.id)).toEqual(["r", "a", "w"]);
  });

  it("canMoveFolder: nicht in sich selbst, nicht in Unterordner, nicht an den jetzigen Platz", () => {
    expect(canMoveFolder(folders, "r", "r")).toBe(false);
    expect(canMoveFolder(folders, "r", "i")).toBe(false);
    expect(canMoveFolder(folders, "r", "n")).toBe(false);
    expect(canMoveFolder(folders, "r", null)).toBe(false);
    expect(canMoveFolder(folders, "i", "r")).toBe(false);

    expect(canMoveFolder(folders, "r", "w")).toBe(true);
    expect(canMoveFolder(folders, "n", "r")).toBe(true);
    expect(canMoveFolder(folders, "i", null)).toBe(true);
    expect(canMoveFolder(folders, "i", "a")).toBe(true);
    expect(canMoveFolder(folders, "unbekannt", null)).toBe(false);
  });
});
