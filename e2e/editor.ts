import { expect, type Page } from "@playwright/test";

// Bedienung des Seiten-Editors: die Ansicht (View) mit Rahmen um Seite und Inhaltsbereich;
// „Bearbeiten“ öffnet den Edit-Modus der Liste im Popup, dort auf Wunsch links der Baum.

export function editor(page: Page) {
  const tree = page.getByRole("navigation", { name: "Elemente" });
  const view = page.getByRole("region", { name: "Ansicht" });
  const dialog = page.getByRole("dialog");
  /** Knoten im Baum über den Anfang seiner Beschriftung, z. B. /^Liste/. */
  const node = (name: RegExp, nth = 0) => tree.getByRole("button", { name }).filter({ hasNotText: "⋯" }).nth(nth);
  return {
    tree,
    view,
    dialog,
    node,
    /** Den Edit-Modus des Inhaltsbereichs öffnen. */
    async edit() {
      await view.getByRole("button", { name: "Liste bearbeiten" }).first().click();
      await expect(dialog).toBeVisible();
    },
    /** Popup öffnen (falls nötig) und darin den Baum einblenden (standardmäßig ausgeblendet). */
    async showTree() {
      if ((await dialog.count()) === 0) await this.edit();
      await dialog.getByRole("button", { name: "Baum einblenden" }).click();
      await expect(tree).toBeVisible();
    },
    /** Menüpunkt im Menü eines Knotens wählen (Rechtsklick im Baum). */
    async menu(name: RegExp, item: string, nth = 0) {
      await node(name, nth).click({ button: "right" });
      await page.getByRole("menuitem", { name: item }).click();
    },
    /** Element hinzufügen (Menü im Baum) und im Popup ausfüllen. */
    async add(container: RegExp, type: string, fill?: () => Promise<unknown>, nth = 0) {
      await this.menu(container, `${type} hinzufügen`, nth);
      await fill?.();
    },
    /** Alle Änderungen im Popup übernehmen; es bleibt offen. */
    async apply() {
      await dialog.getByRole("button", { name: "Übernehmen" }).click();
      await expect(dialog.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
    },
    /** Das Popup schließen (Übernehmen und Abbrechen lassen es offen). */
    async close() {
      await dialog.getByRole("button", { name: "Schließen" }).click();
      await expect(dialog).toHaveCount(0);
    },
    /** Reihenfolge der Knoten im Baum als Beschriftungen. */
    labels: () => tree.getByRole("button").filter({ hasNotText: "⋯" }),
    /** Speichern; ein offenes Popup wird vorher übernommen und geschlossen. */
    async save() {
      if ((await dialog.count()) > 0) {
        if (await dialog.getByRole("button", { name: "Übernehmen" }).isEnabled()) await this.apply();
        await this.close();
      }
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page.getByText("ungespeicherte Änderungen")).toHaveCount(0);
    },
  };
}
