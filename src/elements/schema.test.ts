import { describe, expect, it } from "vitest";
import { completeElement, ELEMENT_TYPES, elementInput, newElement } from "./schema";

const MEDIA_ID = "6f9c4a52-8d3b-4c1e-9a7f-2b5d8e0c1a34";
const media = { id: MEDIA_ID, url: "https://example.com/a.png", width: 10, height: 10, alt: "", filename: "m1.png" };

describe("elementInput", () => {
  it("nimmt jeden Typ mit seinen Daten an", () => {
    expect(elementInput.safeParse({ type: "heading", data: { level: 2, text: "Hallo" } }).success).toBe(true);
    expect(elementInput.safeParse({ type: "text", data: { markdown: "" } }).success).toBe(true);
    expect(elementInput.safeParse({ type: "image", data: {}, mediaId: MEDIA_ID }).success).toBe(true);
  });

  it("verlangt mediaId genau bei Typen mit Bild", () => {
    expect(elementInput.safeParse({ type: "image", data: {} }).success).toBe(false);
    const heading = elementInput.safeParse({ type: "heading", data: { level: 2, text: "Hallo" }, mediaId: MEDIA_ID });
    // Unbekannte Felder fallen weg, statt in die Datenbank zu gelangen.
    expect(heading.success && "mediaId" in heading.data).toBe(false);
  });

  it("lehnt unbekannte Typen und ungültige Daten ab", () => {
    expect(elementInput.safeParse({ type: "video", data: {} }).success).toBe(false);
    const empty = elementInput.safeParse({ type: "heading", data: { level: 2, text: "  " } });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Überschrift darf nicht leer sein");
  });
});

describe("newElement und completeElement", () => {
  it("jeder Typ hat ein leeres Element mit gültiger Form", () => {
    for (const type of ELEMENT_TYPES) expect(newElement(type, "k")).toMatchObject({ key: "k", type });
  });

  it("ein Bild ist erst mit gewähltem Bild vollständig", () => {
    const candidate = newElement("image", "k");
    expect(completeElement(candidate)).toEqual({ ok: false, problem: "Zuerst ein Bild aus der Mediathek wählen." });
    const element = { ...candidate, mediaId: MEDIA_ID, media };
    expect(completeElement(element)).toEqual({ ok: true, element });
  });

  it("prüft die Daten mit dem Schema des Servers", () => {
    expect(completeElement(newElement("heading", "k"))).toEqual({ ok: false, problem: "Überschrift darf nicht leer sein" });
    expect(completeElement(newElement("text", "k")).ok).toBe(true);
  });
});
