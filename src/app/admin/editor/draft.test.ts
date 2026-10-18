import { describe, expect, it } from "vitest";
import { appendChild } from "@/elements/tree";
import type { VersionDetail } from "@/shared/api/versions";
import { createElement, fingerprint, fromVersion, toInput, toView } from "./draft";

const version: VersionDetail = {
  id: "v1",
  postId: "p1",
  postSlug: "wurzeln",
  previewPath: "/preview/wurzeln/v1/token",
  postPublishedVersion: null,
  postFirstPublishedAt: null,
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
  root: {
    id: "p",
    type: "page",
    data: { orientation: "vertical" },
    children: [
      {
        id: "l",
        type: "list",
        data: { orientation: "horizontal" },
        children: [
          { id: "e1", type: "text", data: { markdown: "Eins" } },
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
};

describe("fromVersion / toInput", () => {
  it("ergibt die Eingabe, die das Backend erwartet – mit ids bestehender Elemente, verschachtelt", () => {
    expect(toInput(fromVersion(version), version.updatedAt)).toEqual({
      title: "Wurzeln",
      tagIds: ["t1"],
      updatedAt: version.updatedAt,
      root: {
        id: "p",
        type: "page",
        data: { orientation: "vertical" },
        children: [
          {
            id: "l",
            type: "list",
            data: { orientation: "horizontal" },
            children: [
              { id: "e1", type: "text", data: { markdown: "Eins" } },
              { id: "e2", type: "image", data: { caption: "Bild" }, mediaId: "m1" },
            ],
          },
        ],
      },
    });
  });

  it("neue Elemente haben keine id", () => {
    const draft = fromVersion(version);
    const root = appendChild(draft.root, [], createElement("heading"));
    expect(toInput({ ...draft, root }, "").root.children[1]).toEqual({ id: undefined, type: "heading", data: { level: 2, text: "" } });
  });

  it("fingerprint erkennt Änderungen, nicht aber neue React-Keys", () => {
    const original = fromVersion(version);
    expect(fingerprint(fromVersion(version))).toBe(fingerprint(original));
    expect(fingerprint({ ...original, title: "Anders" })).not.toBe(fingerprint(original));
  });
});

describe("toView", () => {
  it("zeigt ein Bild ohne gewähltes Bild als Hinweis an derselben Stelle", () => {
    const root = appendChild(fromVersion(version).root, [0], createElement("image"));
    const view = toView(root);
    expect("children" in view && view.children[0]).toMatchObject({
      type: "list",
      children: [{ type: "text" }, { type: "image" }, { type: "text", data: { markdown: "*Bild noch nicht gewählt*" } }],
    });
  });
});
