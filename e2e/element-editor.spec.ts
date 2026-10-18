import { editor } from "./editor";
import { expect, test, uploadImages } from "./fixtures";

test("Liste: View wie Show mit Bearbeiten; im Edit-Modus Ausrichtung und Kinder, ein Popup mit Pfad", async ({ page, scratch }) => {
  const folder = await scratch.folder("Editor");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "breit.png", width: 800, height: 400 }]);

  const post = await scratch.post("Editor");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  const dialogs = page.getByRole("dialog");
  const title = e.dialog.getByRole("heading").first();
  /** Im Pfad eine Stufe zurück. */
  const back = () => title.getByRole("button").last().click();
  const addChild = async (type: string, fill: () => Promise<unknown>) => {
    await e.dialog.getByRole("button", { name: "Element hinzufügen" }).click();
    await page.getByRole("menuitem", { name: type, exact: true }).click();
    await fill();
    await back();
  };

  // View: nur der Inhaltsbereich hat „Bearbeiten“, die Seite hat keine Einstellungen
  await expect(e.view.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);
  await e.view.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(title).toHaveText(/^Seite\s*›\s*Liste$/);
  await expect(e.dialog.getByLabel("Ausrichtung")).toHaveValue("vertical");
  await expect(e.dialog.getByText("Noch keine Elemente.")).toBeVisible();
  // Ohne Änderungen sind Übernehmen und Abbrechen inaktiv
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await expect(e.dialog.getByRole("button", { name: "Abbrechen" })).toBeDisabled();

  // Kind hinzufügen: dasselbe Popup zeigt seinen Edit-Modus; unvollständig sperrt es „Übernehmen“
  await e.dialog.getByRole("button", { name: "Element hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Überschrift", exact: true }).click();
  await expect(dialogs).toHaveCount(1);
  await expect(title).toHaveText(/Liste\s*›\s*Überschrift$/);
  await expect(e.dialog.getByRole("textbox", { name: "Überschrift" })).toBeFocused();
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await back();
  await expect(e.dialog.getByText("Überschrift darf nicht leer sein")).toHaveCount(2); // am Kind und neben „Übernehmen“
  await e.dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(e.dialog.getByText("Noch keine Elemente.")).toBeVisible();
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled(); // wieder wie im Entwurf

  await addChild("Überschrift", () => e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Hallo Welt"));
  await addChild("Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Ein **fetter** Absatz."));
  await addChild("Bild", async () => {
    await e.dialog.getByRole("combobox").selectOption({ label: folder.name });
    await e.dialog.locator('button[title="breit.png"]').click();
    await e.dialog.getByLabel("Bildunterschrift").fill("Grünes Rechteck");
  });

  // Kinder im View-Modus; Bearbeiten (Knopf oder Doppelklick) ersetzt den Inhalt des Popups
  await expect(e.dialog.getByRole("heading", { name: "Hallo Welt", level: 2 })).toBeVisible();
  await expect(e.dialog.locator("strong", { hasText: "fetter" })).toBeVisible();
  await e.dialog.getByRole("button", { name: "Überschrift bearbeiten" }).click();
  await expect(dialogs).toHaveCount(1);
  await e.dialog.getByLabel("Ebene").selectOption("3");
  await back();
  await expect(e.dialog.getByRole("heading", { name: "Hallo Welt", level: 3 })).toBeVisible();
  await e.dialog.locator("strong", { hasText: "fetter" }).dblclick();
  await expect(e.dialog.getByRole("textbox", { name: "Text (Markdown)" })).toHaveValue("Ein **fetter** Absatz.");
  await back();

  // Reihenfolge, Löschen, Ausrichtung; Übernehmen übernimmt alles, das Popup bleibt offen
  await e.dialog.getByRole("button", { name: "Nach oben" }).nth(1).click(); // Text vor die Überschrift
  await e.dialog.getByRole("button", { name: "Löschen" }).last().click(); // das Bild
  await e.dialog.getByLabel("Ausrichtung").selectOption("horizontal");
  await e.dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(dialogs).toHaveCount(1);
  await expect(e.dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await expect(e.dialog.getByRole("button", { name: "Abbrechen" })).toBeDisabled();
  await e.close();

  // Die View zeigt die Kinder wie auf der Website, ohne eigene Rahmen und Knöpfe
  await expect(e.view.getByRole("heading", { name: "Hallo Welt", level: 3 })).toBeVisible();
  await expect(e.view.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);

  // Abbrechen stellt den übernommenen Stand wieder her, auch an Kindern; das Popup bleibt offen
  await e.view.getByRole("button", { name: "Bearbeiten" }).click();
  await e.dialog.getByLabel("Ausrichtung").selectOption("vertical");
  await e.dialog.getByRole("button", { name: "Text bearbeiten" }).click();
  await e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Verworfen");
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(e.dialog.getByRole("textbox", { name: "Text (Markdown)" })).toHaveValue("Ein **fetter** Absatz.");
  await expect(e.dialog.getByRole("button", { name: "Abbrechen" })).toBeDisabled();
  await back();
  await expect(e.dialog.getByLabel("Ausrichtung")).toHaveValue("horizontal");

  // Ein neues Kind zählt als Änderung; Abbrechen nimmt es wieder heraus und geht zur Liste zurück
  await e.dialog.getByRole("button", { name: "Element hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await e.dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(title).toHaveText(/^Seite\s*›\s*Liste$/);
  await expect(e.dialog.getByRole("button", { name: "Text bearbeiten" })).toHaveCount(1);
  await e.close();

  await e.save();
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  expect(saved.root.children[0].data).toEqual({ orientation: "horizontal" });
  expect(saved.root.children[0].children.map((c: { type: string; data: unknown }) => [c.type, c.data])).toEqual([
    ["text", { markdown: "Ein **fetter** Absatz." }],
    ["heading", { level: 3, text: "Hallo Welt" }],
  ]);
});

test("Seite und Inhaltsbereich (Liste) stehen fest; die Ausrichtung hat die Liste", async ({ page, scratch }) => {
  const post = await scratch.post("Wurzel");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);

  // Die Seite hat keine Einstellungen: nur der Inhaltsbereich hat „Bearbeiten“
  await expect(e.view.getByRole("button", { name: /bearbeiten/i })).toHaveCount(1);

  // Die Liste nimmt Elemente auf, lässt sich aber weder löschen noch verschieben
  await e.showTree();
  await e.node(/^Liste/).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Liste hinzufügen" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Löschen" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Ausschneiden" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Nach oben" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Seite hinzufügen" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(e.dialog).toBeVisible(); // Escape schließt nur das Menü
  await expect(e.dialog.getByLabel("Ausrichtung")).toHaveValue("vertical");
});

test("Baum im Edit-Modus der Liste: ausgeblendet, bis man ihn einblendet; Klick zeigt ein Element", async ({ page, scratch }) => {
  const post = await scratch.post("Baum");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await expect(e.tree).toHaveCount(0);
  await e.edit();
  await expect(e.tree).toHaveCount(0);

  // Der Knopf steht im Rahmen der Elemente der Liste
  await e.dialog.getByRole("region", { name: "Elemente" }).getByRole("button", { name: "Baum einblenden" }).click();
  await expect(e.tree).toBeVisible();
  await e.add(/^Liste/, "Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Im Baum"));
  await e.node(/^Liste/).click();
  await expect(e.dialog.getByLabel("Ausrichtung")).toBeVisible();
  await e.node(/^Text/).click();
  await expect(e.dialog.getByRole("textbox", { name: "Text (Markdown)" })).toHaveValue("Im Baum");
  await e.close();

  // Die Wahl merkt sich der Browser.
  await e.edit();
  await expect(e.tree).toBeVisible();
  await e.dialog.getByRole("button", { name: "Baum ausblenden" }).click();
  await expect(e.tree).toHaveCount(0);
});
