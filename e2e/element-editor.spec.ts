import { editor } from "./editor";
import { expect, test, uploadImages } from "./fixtures";

test("Liste: View wie Show mit Bearbeiten; im Edit-Modus Ausrichtung und Kinder", async ({ page, scratch }) => {
  const folder = await scratch.folder("Editor");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "breit.png", width: 800, height: 400 }]);

  const post = await scratch.post("Editor");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();
  const dialogs = page.getByRole("dialog");
  const list = dialogs.first();
  const addChild = async (type: string, fill: () => Promise<unknown>) => {
    await list.getByRole("button", { name: "+ Element" }).click();
    await page.getByRole("menuitem", { name: type, exact: true }).click();
    await fill();
    await e.dialog.getByRole("button", { name: "Übernehmen" }).click();
    await expect(dialogs).toHaveCount(1);
  };

  // View: nur der Inhaltsbereich hat „Bearbeiten“, die Seite hat keine Einstellungen
  await expect(e.view.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);
  await e.view.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(list.getByLabel("Ausrichtung")).toHaveValue("vertical");
  await expect(list.getByText("Noch keine Elemente.")).toBeVisible();

  // Kind hinzufügen: Popup über dem der Liste; Übernehmen erst mit Text; Abbrechen fügt nichts ein
  await list.getByRole("button", { name: "+ Element" }).click();
  await page.getByRole("menuitem", { name: "Überschrift", exact: true }).click();
  await expect(dialogs).toHaveCount(2);
  await expect(e.dialog.getByRole("textbox", { name: "Überschrift" })).toBeFocused();
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialogs).toHaveCount(1);
  await expect(list.getByText("Noch keine Elemente.")).toBeVisible();

  await addChild("Überschrift", () => e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Hallo Welt"));
  await addChild("Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Ein **fetter** Absatz."));
  await addChild("Bild", async () => {
    await e.dialog.getByRole("combobox").selectOption({ label: folder.name });
    await e.dialog.locator('button[title="breit.png"]').click();
    await e.dialog.getByLabel("Bildunterschrift").fill("Grünes Rechteck");
  });

  // Kinder im View-Modus: Bearbeiten (Knopf oder Doppelklick) öffnet ihr Popup; Abbrechen verwirft
  await expect(list.getByRole("heading", { name: "Hallo Welt", level: 2 })).toBeVisible();
  await expect(list.locator("strong", { hasText: "fetter" })).toBeVisible();
  await list.getByRole("button", { name: "Überschrift bearbeiten" }).click();
  await e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Verworfen");
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(list.getByRole("heading", { name: "Hallo Welt" })).toBeVisible();
  await list.getByRole("heading", { name: "Hallo Welt" }).dblclick();
  await e.dialog.getByLabel("Ebene").selectOption("3");
  await e.dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(list.getByRole("heading", { name: "Hallo Welt", level: 3 })).toBeVisible();

  // Reihenfolge und Löschen; Ausrichtung ändern
  await list.getByRole("button", { name: "Nach oben" }).nth(1).click(); // Text vor die Überschrift
  await addChild("Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Wieder weg"));
  await list.getByRole("button", { name: "Löschen" }).last().click();
  await expect(list.getByText("Wieder weg")).toHaveCount(0);
  await list.getByLabel("Ausrichtung").selectOption("horizontal");

  // Abbrechen verwirft alles, Übernehmen übernimmt Liste samt Kindern
  await list.getByRole("button", { name: "Abbrechen" }).last().click();
  await expect(e.labels()).toHaveText([/^Seite/, /^Liste/]);
  await e.view.getByRole("button", { name: "Bearbeiten" }).click();
  await addChild("Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Ein **fetter** Absatz."));
  await addChild("Überschrift", () => e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Hallo Welt"));
  await list.getByLabel("Ausrichtung").selectOption("horizontal");
  await list.getByRole("button", { name: "Übernehmen" }).last().click();
  await expect(dialogs).toHaveCount(0);

  // Die View zeigt die Kinder wie auf der Website, ohne eigene Rahmen und Knöpfe
  await expect(e.view.getByRole("heading", { name: "Hallo Welt", level: 2 })).toBeVisible();
  await expect(e.view.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);
  await expect(e.labels()).toHaveText([/^Seite/, /^Liste/, /^Text/, /^Überschrift/]);

  await e.save();
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  expect(saved.root.children[0].data).toEqual({ orientation: "horizontal" });
  expect(saved.root.children[0].children.map((c: { type: string; data: unknown }) => [c.type, c.data])).toEqual([
    ["text", { markdown: "Ein **fetter** Absatz." }],
    ["heading", { level: 2, text: "Hallo Welt" }],
  ]);
});

test("Seite und Inhaltsbereich (Liste) stehen fest; die Ausrichtung hat die Liste", async ({ page, scratch }) => {
  const post = await scratch.post("Wurzel");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();

  // Die Seite hat keine Aktionen: kein Menü, kein Bearbeiten
  await e.node(/^Seite/).click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(e.view.locator('[id="element-"] > div').first().getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);

  // Die Liste nimmt Elemente auf, lässt sich aber weder löschen noch verschieben
  await e.node(/^Liste/).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Liste hinzufügen" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Löschen" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Ausschneiden" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Nach oben" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Seite hinzufügen" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await e.view.locator('[id="element-0"]').getByRole("button", { name: "Bearbeiten" }).click();
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
