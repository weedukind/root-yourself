import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Über Wurzeln", "ueber-wurzeln"],
    ["Äpfel, Öl & Süßes", "aepfel-oel-suesses"],
    ["ÄÖÜ großgeschrieben", "aeoeue-grossgeschrieben"],
    ["Café crème", "cafe-creme"],
    ["  --Viele   Leer  zeichen-- ", "viele-leer-zeichen"],
    ["Version 2.0: Neu!", "version-2-0-neu"],
    ["🌱 Emoji", "emoji"],
    ["!!!", ""],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("kürzt lange Titel an einer Wortgrenze auf höchstens 80 Zeichen", () => {
    const slug = slugify("Wurzel ".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^(wurzel-)*wurzel$/);
  });

  it("erzeugt immer gültige Slugs", () => {
    for (const input of ["Über Wurzeln", "Café crème", "a".repeat(200)]) {
      expect(isValidSlug(slugify(input))).toBe(true);
    }
  });
});

describe("isValidSlug", () => {
  it.each(["a", "ueber-wurzeln", "v2"])("akzeptiert %j", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(["", "-a", "a-", "a--b", "Über", "a b", "a".repeat(81)])("lehnt %j ab", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});
