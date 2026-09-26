import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatLongDateTime } from "./format";

describe("Datumsformate", () => {
  it("zeigen deutsche Zeit, unabhängig von der Zeitzone des Servers", () => {
    // 22:30 UTC ist in Berlin schon der nächste Tag (Sommerzeit, UTC+2).
    const instant = "2026-09-26T22:30:00Z";
    expect(formatDate(instant)).toBe("27. September 2026");
    expect(formatDateTime(instant)).toBe("27.09.2026, 00:30");
    // Winterzeit: UTC+1
    expect(formatLongDateTime("2026-10-26T20:56:00Z")).toBe("26. Oktober 2026 um 21:56");
  });
});
