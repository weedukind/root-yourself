import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

// Anreißer für Teaser: das erste Text-Element als reiner Text, an einer Wortgrenze gekürzt.

const BLOCKS = new Set(["paragraph", "heading", "list", "listItem", "blockquote", "table", "tableRow", "tableCell", "code"]);

/**
 * Text eines Markdown-Baums; Blöcke durch Leerzeichen getrennt. Bilder und HTML entfallen:
 * HTML-Blöcke in eigener Zeile samt Inhalt; bei Tags mitten im Satz bleibt der Text dazwischen.
 */
function plainText(node: Nodes): string {
  if (node.type === "html" || node.type === "image" || node.type === "imageReference") return "";
  if (node.type === "break") return " ";
  if ("value" in node) return node.value;
  if (!("children" in node)) return "";
  return (node.children as Nodes[]).map((child) => (BLOCKS.has(child.type) ? ` ${plainText(child)} ` : plainText(child))).join("");
}

export function excerpt(markdown: string, maxLength = 300): string {
  const text = plainText(fromMarkdown(markdown)).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?–-]+$/, "")} …`;
}
