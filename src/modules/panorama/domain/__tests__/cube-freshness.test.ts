// Panorama cube-freshness stamp — pure domain formatter (staging QA 2026-07-17,
// Cursor I2). The staging cube refreshes once daily, so an operator can't tell
// "no data" from "data lagging a day". This stamp surfaces the cube's build time
// HONESTLY — and omits itself entirely when there is no build to declare.

import { describe, expect, it } from "vitest";

import { cubeFreshnessStamp } from "../cube-freshness";

describe("cubeFreshnessStamp", () => {
  it("formats a built-at instant as the AR-pinned es-AR stamp line", () => {
    // 07:30 UTC → 04:30 in America/Argentina/Buenos_Aires (UTC-3).
    const builtAt = new Date("2026-07-17T07:30:00Z");
    expect(cubeFreshnessStamp(builtAt)).toBe("Datos agregados actualizados: 17/07/2026 04:30");
  });

  it("pins the AR calendar day for an instant near AR midnight (never the UTC day)", () => {
    // 01:15 UTC on the 18th is still 22:15 on the 17th in Argentina (UTC-3).
    const builtAt = new Date("2026-07-18T01:15:00Z");
    expect(cubeFreshnessStamp(builtAt)).toBe("Datos agregados actualizados: 17/07/2026 22:15");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(cubeFreshnessStamp("2026-07-17T07:30:00Z")).toBe(
      "Datos agregados actualizados: 17/07/2026 04:30",
    );
  });

  // Omit-when-missing branch: the meta row is absent or never refreshed. Better
  // to show NOTHING than to fabricate a freshness the cube can't back.
  it("returns null when builtAt is null (meta row missing / never refreshed)", () => {
    expect(cubeFreshnessStamp(null)).toBeNull();
  });

  it("returns null when builtAt is undefined", () => {
    expect(cubeFreshnessStamp(undefined)).toBeNull();
  });

  it("returns null for an invalid date rather than an 'Invalid Date' stamp", () => {
    expect(cubeFreshnessStamp(new Date("not-a-date"))).toBeNull();
    expect(cubeFreshnessStamp("nonsense")).toBeNull();
  });
});
