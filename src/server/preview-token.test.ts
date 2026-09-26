import { describe, expect, it } from "vitest";
import { createPreviewToken, verifyPreviewToken } from "./preview-token";

const version = "5ca6ff4d-c6b9-4b3e-ace6-670050d3182d";
const now = new Date("2026-09-26T12:00:00Z");

describe("Vorschau-Token", () => {
  it("gilt für diese Version bis zum Ablauf", () => {
    const { token, expiresAt } = createPreviewToken(version, 7, now);
    expect(expiresAt.toISOString()).toBe("2026-10-03T12:00:00.000Z");
    expect(verifyPreviewToken(version, token, now)).toEqual(expiresAt);
    expect(verifyPreviewToken(version, token, new Date("2026-10-03T11:59:59Z"))).toEqual(expiresAt);
  });

  it("ist nach Ablauf ungültig", () => {
    const { token } = createPreviewToken(version, 1, now);
    expect(verifyPreviewToken(version, token, new Date("2026-09-27T12:00:00Z"))).toBeNull();
  });

  it("gilt nicht für andere Versionen", () => {
    const { token } = createPreviewToken(version, 7, now);
    expect(verifyPreviewToken(crypto.randomUUID(), token, now)).toBeNull();
  });

  it("verlängern durch Ändern des Ablaufs macht die Signatur ungültig", () => {
    const { token } = createPreviewToken(version, 1, now);
    const [expiry, signature] = token.split(".");
    const forged = `${(parseInt(expiry, 36) + 365 * 86400).toString(36)}.${signature}`;
    expect(verifyPreviewToken(version, forged, now)).toBeNull();
  });

  it("lehnt kaputte Tokens ab", () => {
    for (const token of ["", "abc", "abc.def.ghi", "zzzzzzzzzzzzzz.x", ".x"]) {
      expect(verifyPreviewToken(version, token, now)).toBeNull();
    }
  });
});
