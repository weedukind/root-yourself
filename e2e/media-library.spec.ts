import { expect, test, uploadImages } from "./fixtures";

test("Bilder auswählen, ausschneiden, in anderen Ordner einfügen und löschen", async ({ page, scratch }) => {
  const source = await scratch.folder("Quelle");
  const target = await scratch.folder("Ziel");
  await page.goto(`/admin/media?folder=${source.id}`);
  await uploadImages(page, [{ name: "eins.png" }, { name: "zwei.png" }, { name: "drei.png" }]);

  // Kacheln ohne Ordner-Dropdown und Löschen-Knopf
  await expect(page.getByRole("button", { name: "Löschen", exact: true })).toHaveCount(0);

  await page.getByLabel("eins.png auswählen").check();
  await page.getByLabel("zwei.png auswählen").check();
  await expect(page.getByText("2 Bilder ausgewählt")).toBeVisible();
  await page.getByRole("button", { name: "Ausgewählte Bilder ausschneiden" }).click();
  await expect(page.getByText("2 Bilder ausgeschnitten")).toBeVisible();

  const tree = page.getByRole("navigation", { name: "Ordner" });
  await tree.getByText(target.name).click({ button: "right" });
  await page.getByRole("menuitem", { name: "2 Bilder einfügen" }).click();
  await expect(page.locator("main ul li img")).toHaveCount(1);
  expect((await scratch.media(target.id)).map((m) => m.filename).sort()).toEqual(["eins.png", "zwei.png"]);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Alle auswählen").check();
  await page.getByRole("button", { name: "Ausgewählte Bilder löschen" }).click();
  await expect(page.getByText("In diesem Ordner liegen noch keine Bilder.")).toBeVisible();
  expect(await scratch.media(source.id)).toHaveLength(0);
});

test("Alt-Text per Doppelklick bearbeiten: Enter speichert, Escape verwirft", async ({ page, scratch }) => {
  const folder = await scratch.folder("Alt-Text");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "alt.png" }]);

  const shown = page.getByRole("button", { name: /Alt-Text von alt\.png/ });
  const input = page.getByRole("textbox", { name: "Alt-Text von alt.png" });
  await expect(shown).toHaveText("Kein Alt-Text");

  await shown.dblclick();
  await input.fill("Ein grünes Rechteck");
  await input.press("Enter");
  await expect(shown).toHaveText("Ein grünes Rechteck");
  expect((await scratch.media(folder.id))[0].alt).toBe("Ein grünes Rechteck");

  await shown.dblclick();
  await input.fill("Verworfen");
  await input.press("Escape");
  await expect(shown).toHaveText("Ein grünes Rechteck");
  expect((await scratch.media(folder.id))[0].alt).toBe("Ein grünes Rechteck");

  // Tastatur: Fokus und Enter öffnen das Feld
  await shown.focus();
  await page.keyboard.press("Enter");
  await expect(input).toBeVisible();
});
