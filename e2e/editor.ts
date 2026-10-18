import { expect, type Page } from "@playwright/test";

// Bedienung des Seiten-Editors: die Ansicht (View) mit einem Rahmen pro Element, auf Wunsch
// links der Baum; Bearbeiten und Hinzufügen öffnen das Formular im Popup.

export function editor(page: Page) {
  const tree = page.getByRole("navigation", { name: "Elemente" });
  const view = page.getByRole("region", { name: "Ansicht" });
  // Das oberste Popup; Popups von Kindern liegen über dem ihres Containers.
  const dialog = page.getByRole("dialog").last();
  /** Knoten im Baum über den Anfang seiner Beschriftung, z. B. /^Liste/. */
  const node = (name: RegExp, nth = 0) => tree.getByRole("button", { name }).filter({ hasNotText: "⋯" }).nth(nth);
  return {
    tree,
    view,
    dialog,
    node,
    /** Den Baum einblenden (standardmäßig ausgeblendet). */
    async showTree() {
      await page.getByRole("button", { name: "Baum einblenden" }).click();
      await expect(tree).toBeVisible();
    },
    /** Menüpunkt im Menü eines Knotens wählen (Rechtsklick im Baum). */
    async menu(name: RegExp, item: string, nth = 0) {
      await node(name, nth).click({ button: "right" });
      await page.getByRole("menuitem", { name: item }).click();
    },
    /** Element hinzufügen (Menü im Baum) und im Popup ausfüllen; fill bekommt das Popup. */
    async add(container: RegExp, type: string, fill?: () => Promise<unknown>, nth = 0) {
      await node(container, nth).click({ button: "right" });
      await page.getByRole("menuitem", { name: `${type} hinzufügen` }).click();
      if (!fill) return;
      await fill();
      await dialog.getByRole("button", { name: "Übernehmen" }).click();
      await this.close();
    },
    /** Das Popup schließen (Übernehmen und Abbrechen lassen es offen). */
    async close() {
      await dialog.getByRole("button", { name: "Schließen" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
    /** Reihenfolge der Knoten im Baum als Beschriftungen. */
    labels: () => tree.getByRole("button").filter({ hasNotText: "⋯" }),
    async save() {
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page.getByText("ungespeicherte Änderungen")).toHaveCount(0);
    },
  };
}
