import { editor } from "./editor";
import { expect, test, uploadImages } from "./fixtures";

test("Slide befüllen, verschachteln, speichern und als Karussell zeigen", async ({ page, scratch }) => {
  const folder = await scratch.folder("Slide");
  await page.goto(`/admin/media?folder=${folder.id}`);
  await uploadImages(page, [{ name: "quer.png", width: 800, height: 400 }]);

  const post = await scratch.post("Slide");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();

  // Slide hat keine Einstellungen: wird direkt eingefügt
  await e.add(/^Liste/, "Slide");
  await e.add(/^Slide/, "Überschrift", () => e.dialog.getByRole("textbox", { name: "Überschrift" }).fill("Erste Karte"));
  await e.add(/^Slide/, "Text", () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill("Zweite Karte"));
  await e.add(/^Slide/, "Slide");
  await e.add(/^Slide 0 Elemente/, "Bild", async () => {
    await e.dialog.getByRole("combobox").selectOption({ label: folder.name });
    await e.dialog.locator('button[title="quer.png"]').click();
    await e.dialog.getByLabel("Bildunterschrift").fill("Innen");
  });

  // Escape schließt nur das Menü
  await e.node(/^Überschrift/).click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await e.menu(/^Text Zweite Karte/, "Nach oben");
  await expect(e.labels()).toHaveText([/^Liste/, /^Slide/, /^Text/, /^Überschrift/, /^Slide/, /^Bild/]);

  await e.apply();
  await e.close();

  // Die View zeigt die Slide wie auf der Website; bearbeitet wird in einem Popup, das sich
  // durch den Baum bewegt: Liste → Slide → Überschrift und über den Pfad zurück
  await e.view.getByRole("heading", { name: "Erste Karte" }).dblclick();
  await e.dialog.getByRole("button", { name: "Slide bearbeiten" }).first().click();
  await e.dialog.getByRole("button", { name: "Überschrift bearbeiten" }).click();
  await expect(e.dialog.getByRole("textbox", { name: "Überschrift" })).toHaveValue("Erste Karte");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const title = e.dialog.getByRole("heading").first();
  await expect(title).toHaveText(/^Seite\s*›\s*Liste\s*›\s*Slide\s*›\s*Überschrift$/);
  await title.getByRole("button", { name: "Slide" }).click();
  await expect(e.dialog.getByRole("button", { name: "Überschrift bearbeiten" })).toBeVisible();
  await e.close();

  await e.save();
  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  type Node = { type: string; data: Record<string, unknown>; children?: Node[] };
  const shape = (n: Node): unknown => (n.children ? [n.type, n.children.map(shape)] : [n.type, n.data]);
  expect(saved.root.children[0].children.map(shape)).toEqual([
    [
      "slide",
      [
        ["text", { markdown: "Zweite Karte" }],
        ["heading", { level: 2, text: "Erste Karte" }],
        ["slide", [["image", { caption: "Innen" }]]],
      ],
    ],
  ]);

  await page.goto(saved.previewPath);
  const items = page.getByRole("region").first().locator(":scope > div > div");
  await expect(items).toHaveCount(3);
  const [first, second] = [await items.nth(0).boundingBox(), await items.nth(1).boundingBox()];
  expect([first!.width, first!.height]).toEqual([300, 300]);
  expect(second!.y).toBe(first!.y);
});

test("Karussell zeigt Pfeile nur, wenn die Einträge nicht in die Breite passen", async ({ page, scratch }) => {
  const post = await scratch.post("Pfeile");
  const url = `/api/admin/posts/${post.id}/versions/${post.versionId}`;
  const save = async (n: number) => {
    const current = await (await page.request.get(url)).json();
    const slide = { type: "slide", data: {}, children: Array.from({ length: n }, (_, i) => ({ type: "text", data: { markdown: `Karte ${i + 1}` } })) };
    const response = await page.request.put(url, {
      data: { title: current.title, tagIds: [], root: { ...current.root, children: [{ ...current.root.children[0], children: [slide] }] }, updatedAt: current.updatedAt },
    });
    expect(response.status()).toBe(200);
    return current.previewPath as string;
  };

  await page.goto(await save(1));
  await expect(page.getByText("Karte 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Weiter" })).toHaveCount(0);

  await page.goto(await save(8));
  const next = page.getByRole("button", { name: "Weiter" });
  const back = page.getByRole("button", { name: "Zurück" });
  await expect(next).toBeEnabled();
  await expect(back).toBeDisabled();
  await next.click();
  await expect(back).toBeEnabled();
});
