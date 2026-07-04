// Unit tests for computePresetFrameViewport (panorama-redesign Fase 1).
//
// Pure helper mirroring computeJurisdictionViewport: given a preset's optional
// framing, the captured national bbox (from the map's first fit) and the AR
// fallback bbox, it resolves the fitBounds descriptor the SituationalMap frame
// effect applies — or null when the preset carries no framing (camera untouched).

import { describe, expect, it } from "vitest";

import { computePresetFrameViewport } from "@/components/panorama/situational-map-utils";

const NATIONAL_BBOX: [[number, number], [number, number]] = [
  [-73.58, -55.05],
  [-53.64, -21.78],
];

const AR_FALLBACK_BBOX: [[number, number], [number, number]] = [
  [-73.6, -55.1],
  [-53.6, -21.7],
];

const CUSTOM_BOUNDS: [[number, number], [number, number]] = [
  [-65.77, -35.0],
  [-61.44, -29.3],
];

describe("computePresetFrameViewport", () => {
  it("national framing → fitBounds to the captured national bbox", () => {
    const out = computePresetFrameViewport(
      { kind: "national" },
      NATIONAL_BBOX,
      AR_FALLBACK_BBOX,
    );
    expect(out).toEqual({ kind: "fitBounds", bbox: NATIONAL_BBOX });
  });

  it("national framing without a captured bbox → falls back to the AR bbox", () => {
    const out = computePresetFrameViewport({ kind: "national" }, null, AR_FALLBACK_BBOX);
    expect(out).toEqual({ kind: "fitBounds", bbox: AR_FALLBACK_BBOX });
  });

  it("bbox framing → fitBounds to the explicit bounds (national bbox ignored)", () => {
    const out = computePresetFrameViewport(
      { kind: "bbox", bounds: CUSTOM_BOUNDS },
      NATIONAL_BBOX,
      AR_FALLBACK_BBOX,
    );
    expect(out).toEqual({ kind: "fitBounds", bbox: CUSTOM_BOUNDS });
  });

  it("absent framing (undefined) → null: the camera must not move", () => {
    expect(computePresetFrameViewport(undefined, NATIONAL_BBOX, AR_FALLBACK_BBOX)).toBeNull();
  });

  it("absent framing (null) → null: the camera must not move", () => {
    expect(computePresetFrameViewport(null, NATIONAL_BBOX, AR_FALLBACK_BBOX)).toBeNull();
  });
});
