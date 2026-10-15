import { describe, expect, it } from "vitest";
import { addKnownEmail, MAX_KNOWN_EMAILS, parseKnownEmails } from "./known-emails";

describe("parseKnownEmails", () => {
  it("liest eine gültige Liste", () => {
    expect(parseKnownEmails('["a@example.com","b@example.com"]')).toEqual(["a@example.com", "b@example.com"]);
  });

  it("verwirft fehlende, kaputte und manipulierte Werte", () => {
    expect(parseKnownEmails(undefined)).toEqual([]);
    expect(parseKnownEmails("{kein json")).toEqual([]);
    expect(parseKnownEmails('["keine-mail"]')).toEqual([]);
    expect(parseKnownEmails('{"a":1}')).toEqual([]);
  });
});

describe("addKnownEmail", () => {
  it("stellt die zuletzt benutzte E-Mail nach vorn, ohne Dubletten", () => {
    expect(addKnownEmail(["a@example.com", "b@example.com"], "b@example.com")).toEqual(["b@example.com", "a@example.com"]);
  });

  it("behält höchstens MAX_KNOWN_EMAILS", () => {
    const many = Array.from({ length: MAX_KNOWN_EMAILS }, (_, i) => `n${i}@example.com`);
    const result = addKnownEmail(many, "neu@example.com");
    expect(result).toHaveLength(MAX_KNOWN_EMAILS);
    expect(result[0]).toBe("neu@example.com");
  });
});
