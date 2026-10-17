import { expect, test, uploadImages } from "./fixtures";

test("Slide im Popup mit Baum befüllen, speichern und als Karussell zeigen", async ({ page, scratch }) => {
  const folder = await scratch.folder("Slide");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "quer.png", width: 800, height: 400 }]);

  const post = await scratch.post("Slide");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  await page.getByRole("button", { name: "+ Row" }).click();
  await page.getByRole("button", { name: "+ Element hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Slide" }).click();

  const dialog = page.getByRole("dialog", { name: "Slide hinzufügen" });
  const tree = dialog.getByRole("navigation", { name: "Elemente" });
  const node = (name: RegExp) => tree.getByRole("button", { name }).first();
  const menuOf = async (name: RegExp) => node(name).click({ button: "right" });
  await expect(dialog.getByText("Keine Einstellungen.")).toBeVisible();

  // Überschrift hinzufügen: wird gewählt, ist unvollständig, Übernehmen gesperrt
  await menuOf(/^Slide/);
  await page.getByRole("menuitem", { name: "Überschrift hinzufügen" }).click();
  await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await expect(dialog.getByText("1 Element ist unvollständig")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Überschrift" }).fill("Erste Karte");

  // Text, dann eine verschachtelte Slide mit einem Bild darin
  await menuOf(/^Slide/);
  await page.getByRole("menuitem", { name: "Text hinzufügen" }).click();
  await dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Zweite Karte");
  await menuOf(/^Slide/);
  await page.getByRole("menuitem", { name: "Slide hinzufügen" }).click();
  await menuOf(/^Slide 0 Elemente/);
  await page.getByRole("menuitem", { name: "Bild hinzufügen" }).click();
  await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await dialog.getByRole("combobox").selectOption({ label: folder.name });
  await dialog.locator('button[title="quer.png"]').click();
  await dialog.getByLabel("Bildunterschrift").fill("Innen");
  await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeEnabled();

  // Position ändern: Text nach oben
  await menuOf(/^Text Zweite Karte/);
  await page.getByRole("menuitem", { name: "Nach oben" }).click();
  await expect(tree.getByRole("button", { name: /^(Überschrift|Text|Slide|Bild)/ }).filter({ hasNotText: "⋯" })).toHaveText([
    /^Slide/,
    /^Text/,
    /^Überschrift/,
    /^Slide/,
    /^Bild/,
  ]);

  // Escape schließt nur das Menü, nicht das Popup
  await menuOf(/^Überschrift/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(dialog).toHaveCount(0);
  const view = page.locator(".prose").first();
  await expect(view.getByText("Zweite Karte")).toBeVisible();
  await expect(view.getByRole("heading", { name: "Erste Karte" })).toBeVisible();

  // Doppelklick auf ein Kind: Popup mit diesem Kind gewählt
  await view.getByRole("heading", { name: "Erste Karte" }).dblclick();
  const edit = page.getByRole("dialog", { name: "Slide bearbeiten" });
  await expect(edit.getByRole("textbox", { name: "Überschrift" })).toHaveValue("Erste Karte");
  await edit.getByRole("button", { name: "Abbrechen" }).click();

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("ungespeicherte Änderungen")).toHaveCount(0);
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  type Node = { type: string; data: Record<string, unknown>; children?: Node[] };
  const shape = (e: Node): unknown => (e.children ? [e.type, e.children.map(shape)] : [e.type, e.data]);
  expect(saved.rows[0].cells[0].elements.map(shape)).toEqual([
    [
      "slide",
      [
        ["text", { markdown: "Zweite Karte" }],
        ["heading", { level: 2, text: "Erste Karte" }],
        ["slide", [["image", { caption: "Innen" }]]],
      ],
    ],
  ]);

  // Vorschau-Seite: Einträge 300 × 300 nebeneinander; Pfeile, weil sie nicht in die Breite passen
  await page.goto(saved.previewPath);
  const carousel = page.getByRole("region").first();
  const items = carousel.locator(":scope > div > div");
  await expect(items).toHaveCount(3);
  const [first, second] = [await items.nth(0).boundingBox(), await items.nth(1).boundingBox()];
  expect([first!.width, first!.height]).toEqual([300, 300]);
  expect(second!.y).toBe(first!.y);
  expect(second!.x).toBeGreaterThan(first!.x + 299);
});

test("Karussell zeigt Pfeile nur, wenn die Einträge nicht in die Breite passen", async ({ page, scratch }) => {
  const post = await scratch.post("Pfeile");
  const version = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  const slide = (n: number) => ({
    type: "slide",
    data: {},
    children: Array.from({ length: n }, (_, i) => ({ type: "text", data: { markdown: `Karte ${i + 1}` } })),
  });
  const save = async (n: number) => {
    const current = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
    const response = await page.request.put(`/api/admin/posts/${post.id}/versions/${post.versionId}`, {
      data: {
        title: current.title,
        tagIds: [],
        rows: [{ gridWidth: 1, gridHeight: 1, cells: [{ width: 1, height: 1, elements: [slide(n)] }] }],
        updatedAt: current.updatedAt,
      },
    });
    expect(response.status()).toBe(200);
  };

  await save(1);
  await page.goto(version.previewPath);
  await expect(page.getByText("Karte 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Weiter" })).toHaveCount(0);

  await save(8);
  await page.goto(version.previewPath);
  const next = page.getByRole("button", { name: "Weiter" });
  const back = page.getByRole("button", { name: "Zurück" });
  await expect(next).toBeEnabled();
  await expect(back).toBeDisabled();
  await next.click();
  await expect(back).toBeEnabled();
});
