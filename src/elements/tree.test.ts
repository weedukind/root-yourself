import { describe, expect, it } from "vitest";
import { type ElementCandidate, newElement } from "./schema";
import { appendChild, canMoveInto, isFixed, moveInto, moveWithin, nodeAt, nodeLabel, removeAt, summary, updateAt } from "./tree";

const text = (markdown: string): ElementCandidate => ({ key: markdown, type: "text", data: { markdown } });
const slide = (key: string, children: ElementCandidate[]): ElementCandidate => ({ key, type: "slide", data: {}, children });

// Wurzel S mit A, T (Slide mit B, C), D
const root = slide("S", [text("A"), slide("T", [text("B"), text("C")]), text("D")]);
const keys = (node: ElementCandidate): unknown =>
  node.type === "slide" ? [node.key, node.children.map(keys)] : node.key;

describe("Baum eines Containers", () => {
  it("nodeAt findet Knoten über den Pfad", () => {
    expect(nodeAt(root, [])?.key).toBe("S");
    expect(nodeAt(root, [1, 1])?.key).toBe("C");
    expect(nodeAt(root, [5])).toBeUndefined();
  });

  it("updateAt ersetzt genau einen Knoten", () => {
    const next = updateAt(root, [1, 0], () => text("B2"));
    expect(keys(next)).toEqual(["S", ["A", ["T", ["B2", "C"]], "D"]]);
    expect(keys(root)).toEqual(["S", ["A", ["T", ["B", "C"]], "D"]]); // unverändert
  });

  it("appendChild nur in Container", () => {
    expect(keys(appendChild(root, [1], text("E")))).toEqual(["S", ["A", ["T", ["B", "C", "E"]], "D"]]);
    expect(appendChild(root, [0], text("E"))).toBe(root);
  });

  it("removeAt und moveWithin", () => {
    expect(keys(removeAt(root, [1]))).toEqual(["S", ["A", "D"]]);
    expect(removeAt(root, [])).toBe(root);
    expect(keys(moveWithin(root, [2], -1))).toEqual(["S", ["A", "D", ["T", ["B", "C"]]]]);
    expect(moveWithin(root, [0], -1)).toEqual(root);
  });

  it("canMoveInto: nicht in sich selbst oder einen Nachfahren, nur in Container", () => {
    expect(canMoveInto(root, [0], [1])).toBe(true);
    expect(canMoveInto(root, [1], [1])).toBe(false);
    expect(canMoveInto(root, [], [1])).toBe(false);
    expect(canMoveInto(root, [0], [2])).toBe(false); // D ist kein Container
    const nested = appendChild(root, [1], slide("U", []));
    expect(canMoveInto(nested, [1], [1, 2])).toBe(false);
  });

  it("moveInto setzt ans Ende des Ziels und liefert den neuen Pfad", () => {
    const moved = moveInto(root, [0], [1]);
    // A vor T entfernt → T rückt auf Index 0
    expect(keys(moved.root)).toEqual(["S", [["T", ["B", "C", "A"]], "D"]]);
    expect(moved.path).toEqual([0, 2]);
    expect(nodeAt(moved.root, moved.path)?.key).toBe("A");

    const out = moveInto(root, [1, 0], []);
    expect(keys(out.root)).toEqual(["S", ["A", ["T", ["C"]], "D", "B"]]);
    expect(out.path).toEqual([3]);
  });

  it("Seite: Inhaltsbereich steht fest, Elemente kommen in ihn", () => {
    const page = appendChild(newElement("page", "P"), [0], text("A"));
    expect(nodeAt(page, [0])).toMatchObject({ key: "P.content", type: "list" });
    expect([isFixed(page, []), isFixed(page, [0]), isFixed(page, [0, 0])]).toEqual([true, true, false]);
    expect(appendChild(page, [], text("B"))).toBe(page);
    expect(removeAt(page, [0])).toBe(page);
    expect(canMoveInto(page, [0], [])).toBe(false);
    expect(canMoveInto(page, [0, 0], [])).toBe(false);
  });

  it("nodeLabel: Typ und vom Wert abgeleitet – die ersten 10 Zeichen oder die Zahl der Kinder", () => {
    expect(nodeLabel(text("**Hallo** Welt, wie geht's?"))).toBe("Text [Hallo Welt]");
    expect(nodeLabel(text(""))).toBe("Text");
    expect(nodeLabel({ key: "h", type: "heading", data: { level: 2, text: "  Kitchen Sink" } })).toBe("Überschrift [Kitchen Si]");
    const media = { id: "m", url: "u", width: 1, height: 1, alt: "", filename: "baumkrone-im-sommer.jpg" };
    expect(nodeLabel({ key: "i", type: "image", data: {}, mediaId: "m", media })).toBe("Bild [baumkrone-]");
    expect(nodeLabel({ key: "i", type: "image", data: {} })).toBe("Bild");
    expect(nodeLabel({ key: "l", type: "list", data: { orientation: "vertical" }, children: [text("A"), text("B")] })).toBe("Liste [2]");
    expect(nodeLabel(root)).toBe("Slide [3]");
    expect(nodeLabel(newElement("page", "P"))).toBe("Seite");
  });

  it("summary beschreibt Elemente kurz", () => {
    expect(summary(text("**Fett** und [Link](https://x)"))).toBe("Fett und Link https://x");
    expect(summary(root)).toBe("3 Elemente");
    expect(summary({ key: "i", type: "image", data: {} })).toBe("kein Bild gewählt");
  });
});
