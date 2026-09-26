import { describe, expect, it } from "vitest";
import type { VersionDetail } from "@/shared/api/versions";
import {
  addCell,
  addElement,
  addRow,
  createElement,
  fingerprint,
  fromVersion,
  move,
  moveElementToCell,
  resizeCell,
  resizeGrid,
  toInput,
  type Draft,
} from "./draft";

const version: VersionDetail = {
  id: "v1",
  postId: "p1",
  postSlug: "wurzeln",
  number: 1,
  parentVersionId: null,
  title: "Wurzeln",
  isLeaf: true,
  isPublished: false,
  isEditable: true,
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tags: [{ id: "t1", name: "Baum", slug: "baum" }],
  rows: [
    {
      id: "r1",
      gridWidth: 3,
      gridHeight: 1,
      cells: [
        { id: "c1", width: 2, height: 1, elements: [{ id: "e1", type: "text", data: { markdown: "Eins" } }] },
        {
          id: "c2",
          width: 1,
          height: 1,
          elements: [
            {
              id: "e2",
              type: "image",
              data: { caption: "Bild" },
              mediaId: "m1",
              media: { id: "m1", url: "https://x/m1.png", width: 10, height: 10, alt: "" },
            },
          ],
        },
      ],
    },
  ],
};

describe("fromVersion / toInput", () => {
  it("ergibt die Eingabe, die das Backend erwartet – mit ids bestehender Elemente", () => {
    expect(toInput(fromVersion(version), version.updatedAt)).toEqual({
      title: "Wurzeln",
      tagIds: ["t1"],
      updatedAt: version.updatedAt,
      rows: [
        {
          gridWidth: 3,
          gridHeight: 1,
          cells: [
            { width: 2, height: 1, elements: [{ id: "e1", type: "text", data: { markdown: "Eins" } }] },
            { width: 1, height: 1, elements: [{ id: "e2", type: "image", data: { caption: "Bild" }, mediaId: "m1" }] },
          ],
        },
      ],
    });
  });

  it("neue Elemente haben keine id", () => {
    const draft = addElement(fromVersion(version), 0, 0, createElement({ type: "heading" }));
    const elements = toInput(draft, "").rows[0].cells[0].elements;
    expect(elements[1]).toEqual({ id: undefined, type: "heading", data: { level: 2, text: "" } });
  });
});

describe("Bearbeiten", () => {
  it("move verschiebt innerhalb der Grenzen und ignoriert alles andere", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 2, -2)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("eine breitere Zelle ist immer möglich – das Grid bekommt die nötigen Zeilen", () => {
    // 3×1 mit drei Zellen, erste Zelle auf Breite 3 → Zelle 1 oben, Zellen 2 und 3 darunter.
    let draft = addRow({ title: "", tagIds: [], rows: [] } as Draft);
    draft = resizeGrid(draft, 0, 3, 1);
    draft = addCell(addCell(draft, 0), 0);
    expect(draft.rows[0].gridHeight).toBe(1);
    draft = resizeCell(draft, 0, 0, 3, 1);
    expect(draft.rows[0]).toMatchObject({ gridWidth: 3, gridHeight: 2, cells: [{ width: 3 }, { width: 1 }, { width: 1 }] });
  });

  it("eine Zelle mehr als Platz ist, erweitert das Grid um eine Zeile", () => {
    let draft = resizeGrid(addRow({ title: "", tagIds: [], rows: [] } as Draft), 0, 2, 1);
    draft = addCell(draft, 0); // 2 Zellen: voll
    draft = addCell(draft, 0);
    expect(draft.rows[0].gridHeight).toBe(2);
  });

  it("weniger Spalten verkleinern Zellen und erweitern das Grid bei Bedarf", () => {
    const draft = resizeGrid(fromVersion(version), 0, 1, 1); // 3×1 [2][1] → 1 Spalte
    expect(draft.rows[0]).toMatchObject({ gridWidth: 1, gridHeight: 2, cells: [{ width: 1 }, { width: 1 }] });
  });

  it("verschiebt ein Element in eine andere Zelle, ohne seine id zu verlieren", () => {
    const draft = moveElementToCell(fromVersion(version), { row: 0, cell: 0, index: 0 }, { row: 0, cell: 1 });
    expect(draft.rows[0].cells[0].elements).toEqual([]);
    expect(draft.rows[0].cells[1].elements.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("eine neue Row hat 1 Spalte und eine Zelle", () => {
    const draft = addRow({ title: "", tagIds: [], rows: [] } as Draft);
    expect(draft.rows[0]).toMatchObject({ gridWidth: 1, gridHeight: 1, cells: [{ width: 1, height: 1, elements: [] }] });
  });

  it("fingerprint erkennt Änderungen, nicht aber neue React-Keys", () => {
    const original = fromVersion(version);
    expect(fingerprint(fromVersion(version))).toBe(fingerprint(original));
    expect(fingerprint({ ...original, title: "Anders" })).not.toBe(fingerprint(original));
  });
});
