import { expect, test } from "./fixtures";

test("Ordner anlegen, umbenennen und Kontextmenü schließen", async ({ page, scratch }) => {
  const name = scratch.name("Baum");
  await page.goto("/admin/media");
  const tree = page.getByRole("navigation", { name: "Ordner" });
  const plus = page.getByRole("button", { name: "Neuen Ordner auf der obersten Ebene anlegen" });
  const newName = page.getByLabel("Name des neuen Ordners");

  await plus.click();
  await newName.fill("verworfen");
  await newName.press("Escape");
  await expect(newName).toHaveCount(0);

  await plus.click();
  await newName.fill("   ");
  await newName.press("Enter");
  await expect(newName).toBeVisible(); // leerer Name: bleibt offen
  await newName.fill(name);
  await newName.press("Enter");
  await expect(tree.getByText(name, { exact: true })).toBeVisible();

  const folders: { id: string; name: string }[] = await (await page.request.get("/api/admin/media/folders")).json();
  scratch.track(folders.find((f) => f.name === name)!.id);

  await tree.getByRole("button", { name: new RegExp(`^${name}`) }).focus();
  await page.keyboard.press("F2");
  await page.getByLabel("Neuer Name").fill(`${name} neu`);
  await page.keyboard.press("Enter");
  await expect(tree.getByText(`${name} neu`)).toBeVisible();

  await tree.getByText(`${name} neu`).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.mouse.click(1000, 900);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await tree.getByText(`${name} neu`).click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
