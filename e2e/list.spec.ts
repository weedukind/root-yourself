import { editor } from "./editor";
import { expect, test } from "./fixtures";

test("Liste: untereinander oder nebeneinander, auf dem Handy untereinander", async ({ page, scratch }) => {
  const post = await scratch.post("Liste");
  await page.goto(`/admin/posts/${post.id}/versions/${post.versionId}`);
  const e = editor(page);
  await e.showTree();
  const text = (value: string) => () => e.dialog.getByRole("textbox", { name: "Text (Markdown)" }).fill(value);

  await e.add(/^Seite/, "Liste", () => e.dialog.getByLabel("Ausrichtung").selectOption("horizontal"));
  for (const name of ["Links", "Mitte", "Rechts"]) await e.add(/^Liste/, "Text", text(name));
  await e.add(/^Seite/, "Text", text("Darunter"));
  await e.save();

  const saved = await (await page.request.get(`/api/admin/posts/${post.id}/versions/${post.versionId}`)).json();
  await page.goto(saved.previewPath);
  const box = async (value: string) => (await page.getByText(value, { exact: true }).boundingBox())!;
  const [left, middle, right, below] = await Promise.all(["Links", "Mitte", "Rechts", "Darunter"].map(box));
  // Nebeneinander, je ein Drittel der Breite
  expect(middle.y).toBe(left.y);
  expect(right.y).toBe(left.y);
  expect(Math.abs(right.x - middle.x - (middle.x - left.x))).toBeLessThan(2);
  expect(below.y).toBeGreaterThan(left.y);
  await expect(page.locator("article ul, article ol")).toHaveCount(0);

  // Schmaler Bildschirm: untereinander
  await page.setViewportSize({ width: 390, height: 844 });
  const [l, m] = await Promise.all(["Links", "Mitte"].map(box));
  expect(m.y).toBeGreaterThan(l.y);
  expect(m.x).toBe(l.x);
});
