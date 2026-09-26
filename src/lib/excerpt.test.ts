import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("entfernt Markdown-Formatierung", () => {
    expect(excerpt("Ein **kräftiger** und *kursiver* [Link](https://example.com).")).toBe("Ein kräftiger und kursiver Link.");
  });

  it("trennt Absätze, Listen und Zitate durch Leerzeichen", () => {
    expect(excerpt("Erster Absatz.\n\nZweiter Absatz.\n\n- eins\n- zwei\n\n> Zitat")).toBe(
      "Erster Absatz. Zweiter Absatz. eins zwei Zitat",
    );
  });

  it("lässt HTML-Tags und Bilder weg, behält aber Text zwischen Tags", () => {
    expect(excerpt("Vorher <b>fett</b> nachher ![Bild](x.png)")).toBe("Vorher fett nachher");
    // HTML-Block in eigener Zeile: entfällt samt Inhalt.
    expect(excerpt("<script>alert(1)</script>\n\nDanach")).toBe("Danach");
  });

  it("kürzt an einer Wortgrenze", () => {
    const result = excerpt("Wurzel ".repeat(100), 50);
    expect(result).toBe("Wurzel Wurzel Wurzel Wurzel Wurzel Wurzel Wurzel …");
    expect(result.length).toBeLessThanOrEqual(52);
  });

  it("leerer Text bleibt leer", () => {
    expect(excerpt("")).toBe("");
    expect(excerpt("   \n\n  ")).toBe("");
  });
});
