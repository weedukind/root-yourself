import { describe, expect, it } from "vitest";
import { defaultOf, line, markdown, mediaRef, select } from "./attributes";
import { defineElement } from "./define";

describe("Attribut-Arten", () => {
  it("line: getrimmt, Pflicht mit Meldung aus dem Label, sonst optional", () => {
    const required = line({ label: "Titel", required: true, max: 5 });
    expect(required.schema.parse("  ab  ")).toBe("ab");
    expect(required.schema.safeParse("   ").error?.issues[0].message).toBe("Titel darf nicht leer sein");
    expect(required.schema.safeParse("123456").success).toBe(false);
    expect(defaultOf(required)).toBe("");

    const optional = line({ label: "Notiz", max: 5 });
    expect(optional.schema.parse(undefined)).toBeUndefined();
    expect(defaultOf(optional)).toBeUndefined();
  });

  it("markdown: Länge begrenzt, Default leer", () => {
    const text = markdown({ label: "Text", max: 3 });
    expect(text.schema.safeParse("abcd").success).toBe(false);
    expect(defaultOf(text)).toBe("");
  });

  it("select: nur die angebotenen Werte", () => {
    const level = select({ label: "Ebene", options: [{ value: 2, label: "H2" }, { value: 3, label: "H3" }], default: 2 });
    expect(level.schema.safeParse(3).success).toBe(true);
    expect(level.schema.safeParse(4).success).toBe(false);
    expect(level.schema.safeParse("2").success).toBe(false);
    expect(defaultOf(level)).toBe(2);
  });
});

describe("defineElement", () => {
  const element = defineElement({
    label: "Test",
    attributes: {
      bild: mediaRef({ label: "Bild" }),
      titel: line({ label: "Titel", required: true, max: 10 }),
      notiz: line({ label: "Notiz", max: 10 }),
    },
  });

  it("data enthält alle Attribute außer dem Bild", () => {
    expect(Object.keys(element.data.shape)).toEqual(["titel", "notiz"]);
    expect(element.media).toBe(true);
  });

  it("empty setzt die Defaults und lässt nicht gesetzte weg", () => {
    expect(element.empty()).toEqual({ titel: "" });
  });

  it("höchstens ein Bild pro Element", () => {
    expect(() =>
      defineElement({ label: "Zwei", attributes: { a: mediaRef({ label: "A" }), b: mediaRef({ label: "B" }) } }),
    ).toThrow("höchstens ein Bild-Attribut");
  });
});
