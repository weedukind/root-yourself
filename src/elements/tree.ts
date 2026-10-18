import { childrenOf, type ElementCandidate, elementLabel, isRoot, takesChildren, type TreePath } from "./schema";

// Bearbeitung des Baums eines Container-Elements im Popup: Die Wurzel ist der Container, die
// Zweige sind seine Kinder (TreePath: Indizes, [] ist die Wurzel). Alle Funktionen sind rein und
// geben einen neuen Baum zurück; ungültige Pfade lassen ihn unverändert.

type Node = ElementCandidate;

export function nodeAt(root: Node, path: TreePath): Node | undefined {
  let node: Node | undefined = root;
  for (const index of path) node = node && childrenOf(node)[index];
  return node;
}

const withChildren = (node: Node, children: Node[]): Node => ({ ...node, children }) as Node;

/** Ob das Element fest steht: die Wurzel und ihr Inhaltsbereich lassen sich nicht verschieben oder löschen. */
export function isFixed(root: Node, path: TreePath): boolean {
  if (path.length === 0) return true;
  const parent = nodeAt(root, path.slice(0, -1));
  return parent !== undefined && isRoot(parent.type);
}

/** Ersetzt den Knoten am Pfad durch change(knoten). */
export function updateAt(root: Node, path: TreePath, change: (node: Node) => Node): Node {
  if (path.length === 0) return change(root);
  const [index, ...rest] = path;
  const children = childrenOf(root);
  if (!children[index]) return root;
  return withChildren(root, children.map((child, i) => (i === index ? updateAt(child, rest, change) : child)));
}

/** Hängt ein Kind ans Ende eines Containers. */
export function appendChild(root: Node, containerPath: TreePath, child: Node): Node {
  const container = nodeAt(root, containerPath);
  if (!container || !takesChildren(container.type)) return root;
  return updateAt(root, containerPath, (node) => withChildren(node, [...childrenOf(node), child]));
}

export function removeAt(root: Node, path: TreePath): Node {
  if (isFixed(root, path)) return root;
  const parent = path.slice(0, -1);
  const index = path[path.length - 1];
  return updateAt(root, parent, (node) => withChildren(node, childrenOf(node).filter((_, i) => i !== index)));
}

/** Verschiebt ein Kind innerhalb seines Containers um delta Plätze. */
export function moveWithin(root: Node, path: TreePath, delta: number): Node {
  if (isFixed(root, path)) return root;
  const index = path[path.length - 1];
  const target = index + delta;
  return updateAt(root, path.slice(0, -1), (node) => {
    const children = [...childrenOf(node)];
    if (target < 0 || target >= children.length) return node;
    const [moved] = children.splice(index, 1);
    children.splice(target, 0, moved);
    return withChildren(node, children);
  });
}

/** Ob from in den Container to verschoben werden kann: nicht in sich selbst oder einen eigenen Nachfahren. */
export function canMoveInto(root: Node, from: TreePath, to: TreePath): boolean {
  const container = nodeAt(root, to);
  if (isFixed(root, from) || !nodeAt(root, from) || !container || !takesChildren(container.type)) return false;
  return !(to.length >= from.length && from.every((index, i) => to[i] === index));
}

/** Setzt from ans Ende des Containers to; liefert den neuen Baum und den neuen Pfad des Elements. */
export function moveInto(root: Node, from: TreePath, to: TreePath): { root: Node; path: TreePath } {
  if (!canMoveInto(root, from, to)) return { root, path: from };
  const node = nodeAt(root, from)!;
  // Liegt das Ziel hinter dem Element im selben Container, rückt es nach dem Entfernen auf.
  const depth = from.length - 1;
  const target = [...to];
  if (to.length > depth && from.slice(0, depth).every((index, i) => to[i] === index) && to[depth] > from[depth]) {
    target[depth] -= 1;
  }
  const next = appendChild(removeAt(root, from), target, node);
  return { root: next, path: [...target, childrenOf(nodeAt(next, target)!).length - 1] };
}

/** Markdown ohne Auszeichnungszeichen, Leerraum zusammengefasst. */
const plainText = (markdown: string) => markdown.replace(/[#*_`>[\]()-]/g, " ").replace(/\s+/g, " ").trim();

/** Kurze Beschreibung für den Baum, damit man gleichartige Elemente unterscheiden kann. */
export function summary(node: Node): string {
  const shorten = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text);
  switch (node.type) {
    case "heading":
      return shorten(node.data.text.trim());
    case "text":
      // Markdown-Zeichen weglassen, nur die ersten Wörter.
      return shorten(plainText(node.data.markdown));
    case "image":
      return shorten(node.data.caption?.trim() || node.media?.alt || (node.media ? "" : "kein Bild gewählt"));
    case "page":
    case "list":
    case "slide":
      return node.children.length === 1 ? "1 Element" : `${node.children.length} Elemente`;
  }
}

/**
 * Label eines Elements, abgeleitet aus seinem Wert: Typ und in Klammern die ersten 10 Zeichen des
 * Texts bzw. Bildnamens oder die Zahl der Kinder, z. B. „Text [Hallo Welt]“, „Liste [3]“. Ohne
 * Wert (leerer Text, noch kein Bild, Seite) nur der Typ. Steht im Pfad des Popups.
 */
export function nodeLabel(node: Node): string {
  const value = (() => {
    switch (node.type) {
      case "heading":
        return node.data.text.trim().slice(0, 10);
      case "text":
        return plainText(node.data.markdown).slice(0, 10);
      case "image":
        return node.media?.filename.slice(0, 10) ?? "";
      case "list":
      case "slide":
        return String(node.children.length);
      case "page":
        return "";
    }
  })();
  return value ? `${elementLabel(node.type)} [${value}]` : elementLabel(node.type);
}
