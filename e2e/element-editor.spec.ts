import { expect, test, uploadImages } from "./fixtures";

test("Elemente hinzufügen, bearbeiten, verwerfen und speichern", async ({ page, scratch }) => {
  const folder = await scratch.folder("Editor");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "breit.png", width: 800, height: 400 }]);

  const post = await scratch.post("Editor");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  await page.getByRole("button", { name: "+ Row" }).click();
  const dialog = page.getByRole("dialog");
  const content = page.locator(".prose");

  // Überschrift: Übernehmen erst mit Text, Fokus im Textfeld
  await page.getByRole("button", { name: "+ Element hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Überschrift" }).click();
  await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await expect(dialog.getByText("Überschrift darf nicht leer sein")).toBeVisible();
  await expect(dialog.getByLabel("Überschrift")).toBeFocused();
  await dialog.getByLabel("Überschrift").fill("Hallo Welt");
  await dialog.getByLabel("Überschrift").press("Enter");
  await expect(content.getByRole("heading", { name: "Hallo Welt", level: 2 })).toBeVisible();

  // Text nach der Überschrift
  await page.getByRole("button", { name: "+ Element hinzufügen" }).first().click();
  await page.getByRole("menuitem", { name: "Text" }).click();
  await dialog.getByLabel("Text (Markdown)").fill("Ein **fetter** Absatz.");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(content.locator("strong", { hasText: "fetter" })).toBeVisible();

  // Bild am Ende: Übernehmen erst mit gewähltem Bild; View als Vorschau bis 300 × 300
  await page.getByRole("button", { name: "+ Element hinzufügen" }).last().click();
  await page.getByRole("menuitem", { name: "Bild" }).click();
  await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await dialog.getByRole("combobox").selectOption({ label: folder.name });
  await dialog.locator('button[title="breit.png"]').click();
  await dialog.getByLabel("Bildunterschrift").fill("Grünes Rechteck");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  const image = content.locator("figure img");
  await expect(content.getByText("Grünes Rechteck")).toBeVisible();
  await expect.poll(async () => (await image.boundingBox())?.width).toBe(300);
  expect(Math.round((await image.boundingBox())!.height)).toBe(150);

  // Doppelklick öffnet Edit, Escape verwirft
  await content.getByRole("heading", { name: "Hallo Welt" }).dblclick();
  await dialog.getByLabel("Überschrift").fill("Verworfen");
  await page.keyboard.press("Escape");
  await expect(content.getByRole("heading", { name: "Hallo Welt" })).toBeVisible();

  // ✎ öffnet Edit, Übernehmen ändert den Entwurf
  await page.getByRole("button", { name: "Element bearbeiten" }).first().click();
  await dialog.getByLabel("Ebene").selectOption("3");
  await dialog.getByLabel("Überschrift").fill("Neue Überschrift");
  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(content.getByRole("heading", { name: "Neue Überschrift", level: 3 })).toBeVisible();

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("ungespeicherte Änderungen")).toHaveCount(0);
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  expect(saved.rows[0].cells[0].elements.map((e: { type: string; data: unknown }) => [e.type, e.data])).toEqual([
    ["heading", { level: 3, text: "Neue Überschrift" }],
    ["text", { markdown: "Ein **fetter** Absatz." }],
    ["image", { caption: "Grünes Rechteck" }],
  ]);
});
