// Panorama freshness/liveness caption — pure domain formatter (Cursor I2,
// reshaped by the cube-ON decision K4/S3 2026-07-24). The cube refreshes once
// daily, so an operator must always see WHICH world the view comes from: a
// declared-age precomputed snapshot, or a live computation (with its capped
// layers named — a truncated live view must never read as complete).

import { describe, expect, it } from "vitest";

import { panoramaFreshnessCaption } from "../cube-freshness";

describe("panoramaFreshnessCaption", () => {
  it("formats a cube built-at instant as the AR-pinned es-AR precomputed line", () => {
    // 07:30 UTC → 04:30 in America/Argentina/Buenos_Aires (UTC-3).
    const builtAt = new Date("2026-07-17T07:30:00Z");
    expect(panoramaFreshnessCaption(builtAt)).toBe("Datos precalculados al 17/07/2026 04:30");
  });

  it("pins the AR calendar day for an instant near AR midnight (never the UTC day)", () => {
    // 01:15 UTC on the 18th is still 22:15 on the 17th in Argentina (UTC-3).
    const builtAt = new Date("2026-07-18T01:15:00Z");
    expect(panoramaFreshnessCaption(builtAt)).toBe("Datos precalculados al 17/07/2026 22:15");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(panoramaFreshnessCaption("2026-07-17T07:30:00Z")).toBe(
      "Datos precalculados al 17/07/2026 04:30",
    );
  });

  // Live branch: no build to declare → the caption says live instead of
  // fabricating a freshness the cube can't back.
  it("says 'Datos en vivo' when builtAt is null (live-served / never refreshed)", () => {
    expect(panoramaFreshnessCaption(null)).toBe("Datos en vivo");
  });

  it("says 'Datos en vivo' when builtAt is undefined", () => {
    expect(panoramaFreshnessCaption(undefined)).toBe("Datos en vivo");
  });

  it("treats an invalid date as live rather than emitting an 'Invalid Date' stamp", () => {
    expect(panoramaFreshnessCaption(new Date("not-a-date"))).toBe("Datos en vivo");
    expect(panoramaFreshnessCaption("nonsense")).toBe("Datos en vivo");
  });

  // K4 — a truncated LIVE view is never presented as complete: the caption
  // names the capped layers (same list the map-table CSV comment discloses).
  it("appends the capped-layer disclosure to the live caption", () => {
    expect(panoramaFreshnessCaption(null, ["Perdidas", "Denuncias"])).toBe(
      "Datos en vivo · capas al tope (2.000): Perdidas, Denuncias",
    );
  });

  it("does NOT decorate the precomputed caption with live-cap labels", () => {
    // A cube-served view is not subject to the live per-layer cap; its own
    // residual truncation is disclosed per layer by the LayerPanel badge.
    expect(panoramaFreshnessCaption(new Date("2026-07-17T07:30:00Z"), ["Perdidas"])).toBe(
      "Datos precalculados al 17/07/2026 04:30",
    );
  });
});
