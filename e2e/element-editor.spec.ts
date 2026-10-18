import { editor } from "./editor";
import { expect, test, uploadImages } from "./fixtures";

test("Elemente hinzufügen und bearbeiten: View mit Bearbeiten, Edit im Popup", async ({ page, scratch }) => {
  const folder = await scratch.folder("Editor");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "breit.png", width: 800, height: 400 }]);

  const post = await scratch.post("Editor");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();

  // Hinzufügen: Popup mit Formular; Übernehmen erst mit Text; Abbrechen fügt nichts ein
  await e.node(/^Seite/).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Überschrift hinzufügen" }).click();
  await expect(e.dialog.getByRole("textbox", { name: "Überschrift" })).toBeFocused();
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(e.labels()).toHaveText([/^Seite/]);

  await e.add(/^Seite/, "Überschrift", () => e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Hallo Welt"));
  await e.add(/^Seite/, "Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Ein **fetter** Absatz."));
  await e.add(/^Seite/, "Bild", async () => {
    await e.dialog.getByRole("combobox").selectOption({ label: folder.name });
    await e.dialog.locator('button[title="breit.png"]').click();
    await e.dialog.getByLabel("Bildunterschrift").fill("Grünes Rechteck");
  });

  // View: wie Show, mit Bearbeiten-Knopf pro Element
  await expect(e.view.getByRole("heading", { name: "Hallo Welt", level: 2 })).toBeVisible();
  await expect(e.view.locator("strong", { hasText: "fetter" })).toBeVisible();
  const image = e.view.locator("figure img");
  await expect.poll(async () => (await image.boundingBox())?.width).toBe(300);
  await expect(e.view.getByRole("button", { name: "Bearbeiten" })).toHaveCount(4); // Seite + 3 Elemente

  // Bearbeiten per Knopf: erst jetzt das Formular; Abbrechen verwirft
  const headingFrame = e.view.locator("#element-0");
  await headingFrame.getByRole("button", { name: "Bearbeiten" }).click();
  await e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Verworfen");
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(e.view.getByRole("heading", { name: "Hallo Welt" })).toBeVisible();

  // Doppelklick in der View bearbeitet ebenfalls
  await e.view.getByRole("heading", { name: "Hallo Welt" }).dblclick();
  await e.dialog.getByLabel("Ebene").selectOption("3");
  await e.dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(e.view.getByRole("heading", { name: "Hallo Welt", level: 3 })).toBeVisible();

  // Strukturknöpfe am gewählten Element: Text nach oben
  await e.view.locator("#element-1").click();
  await e.view.locator("#element-1").getByRole("button", { name: "Nach oben" }).first().click();
  await expect(e.labels()).toHaveText([/^Seite/, /^Text/, /^Überschrift/, /^Bild/]);

  await e.save();
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  expect(saved.root.children.map((c: { type: string; data: unknown }) => [c.type, c.data])).toEqual([
    ["text", { markdown: "Ein **fetter** Absatz." }],
    ["heading", { level: 3, text: "Hallo Welt" }],
    ["image", { caption: "Grünes Rechteck" }],
  ]);
});

test("Die Seite: bearbeitbar (Ausrichtung), aber weder löschbar noch verschiebbar", async ({ page, scratch }) => {
  const post = await scratch.post("Wurzel");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();
  await e.node(/^Seite/).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Liste hinzufügen" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Löschen" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Ausschneiden" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Seite hinzufügen" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await e.view.locator("#element-").getByRole("button", { name: "Bearbeiten" }).click();
  await expect(e.dialog.getByLabel("Ausrichtung")).toHaveValue("vertical");
});

test("Der Baum ist ausgeblendet, bis man ihn einblendet; ohne Baum nutzt die Ansicht die ganze Breite", async ({ page, scratch }) => {
  const post = await scratch.post("Baum");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await expect(e.view).toBeVisible();
  await expect(e.tree).toHaveCount(0);
  const full = (await e.view.boundingBox())!.width;

  await e.showTree();
  expect((await e.view.boundingBox())!.width).toBeLessThan(full - 200);

  // Die Wahl merkt sich der Browser.
  await page.reload();
  await expect(e.tree).toBeVisible();
  await page.getByRole("button", { name: "Baum ausblenden" }).click();
  await expect(e.tree).toHaveCount(0);
  expect((await e.view.boundingBox())!.width).toBe(full);
});
