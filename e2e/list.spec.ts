import { expect, test } from "./fixtures";

test("Liste im Popup befüllen; Kinder stehen untereinander, ohne Aufzählungszeichen", async ({ page, scratch }) => {
  const post = await scratch.post("Liste");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  await page.getByRole("button", { name: "+ Row" }).click();
  await page.getByRole("button", { name: "+ Element hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Liste" }).click();

  const dialog = page.getByRole("dialog", { name: "Liste hinzufügen" });
  const tree = dialog.getByRole("navigation", { name: "Elemente" });
  const menuOf = (name: RegExp) => tree.getByRole("button", { name }).first().click({ button: "right" });

  await menuOf(/^Liste/);
  await page.getByRole("menuitem", { name: "Überschrift hinzufügen" }).click();
  await dialog.getByRole("textbox", { name: "Überschrift" }).fill("Oben");
  await menuOf(/^Liste/);
  await page.getByRole("menuitem", { name: "Liste hinzufügen" }).click();
  await menuOf(/^Liste 0 Elemente/);
  await page.getByRole("menuitem", { name: "Text hinzufügen" }).click();
  await dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Innen");
  await menuOf(/^Liste 2 Elemente/);
  await page.getByRole("menuitem", { name: "Text hinzufügen" }).click();
  await dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Unten");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("ungespeicherte Änderungen")).toHaveCount(0);
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  type Node = { type: string; data: Record<string, unknown>; children?: Node[] };
  const shape = (e: Node): unknown => (e.children ? [e.type, e.children.map(shape)] : [e.type, e.data]);
  expect(saved.rows[0].cells[0].elements.map(shape)).toEqual([
    [
      "list",
      [
        ["heading", { level: 2, text: "Oben" }],
        ["list", [["text", { markdown: "Innen" }]]],
        ["text", { markdown: "Unten" }],
      ],
    ],
  ]);

  await page.goto(saved.previewPath);
  const [top, inner, bottom] = await Promise.all(
    [page.getByRole("heading", { name: "Oben" }), page.getByText("Innen"), page.getByText("Unten")].map(async (l) => (await l.boundingBox())!),
  );
  expect(inner.y).toBeGreaterThan(top.y);
  expect(bottom.y).toBeGreaterThan(inner.y);
  expect([inner.x, bottom.x]).toEqual([top.x, top.x]);
  await expect(page.locator("article ul, article ol, article li")).toHaveCount(0);
});
