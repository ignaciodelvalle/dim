// Unit tests for derivedLevel — the aggregation level is now DERIVED from
// (scope, zoom), not a manual toggle (panorama-ia-v2 §1.1, PO decision #1:
// BOTH zoom and scope trigger locality; prefer precision when it renders).

import { describe, expect, it } from "vitest";

import type { PanoramaScope } from "@/src/modules/panorama/domain/types";

import {
  Z_LOCALITY,
  Z_LOCALITY_ENTER,
  Z_LOCALITY_EXIT,
  derivedLevel,
  derivedLevelWithHysteresis,
  shouldSnapFraming,
} from "../situational-map-utils";

const national: PanoramaScope = { country: "AR" };
const provinceScope: PanoramaScope = { country: "AR", province: "AR-X" };
const localityScope: PanoramaScope = {
  country: "AR",
  province: "AR-X",
  locality: "cordoba-capital",
};

describe("derivedLevel", () => {
  it("national + far zoom → province (kills the green blob nationally)", () => {
    expect(derivedLevel(national, 3)).toBe("province");
  });

  it("national + zoom at/above the locality threshold → locality (zoom triggers precision)", () => {
    expect(derivedLevel(national, 5)).toBe("locality");
    expect(derivedLevel(national, 7)).toBe("locality");
  });

  it("a selected province scope → locality even when zoomed far out (scope wins over zoom)", () => {
    expect(derivedLevel(provinceScope, 2)).toBe("locality");
  });

  it("a selected locality scope → locality regardless of zoom", () => {
    expect(derivedLevel(localityScope, 1)).toBe("locality");
  });

  it("respects a custom belowZoom threshold", () => {
    expect(derivedLevel(national, 4, 6)).toBe("province");
    expect(derivedLevel(national, 6, 6)).toBe("locality");
  });
});

// ---------------------------------------------------------------------------
// panorama magnetic-zoom Phase 2 — hysteresis (Schmitt trigger)
// ---------------------------------------------------------------------------

describe("derivedLevelWithHysteresis", () => {
  it("sanity: the dead-band is non-empty (EXIT strictly below ENTER, straddling Z_LOCALITY)", () => {
    expect(Z_LOCALITY_EXIT).toBeLessThan(Z_LOCALITY_ENTER);
    expect(Z_LOCALITY_EXIT).toBeLessThan(Z_LOCALITY);
    expect(Z_LOCALITY_ENTER).toBeGreaterThan(Z_LOCALITY);
  });

  it("national: crossing ENTER flips province → locality exactly once", () => {
    // Approaching from province, still inside the band → hold province.
    expect(derivedLevelWithHysteresis("province", national, Z_LOCALITY)).toBe("province");
    // At/above ENTER → flip to locality.
    expect(derivedLevelWithHysteresis("province", national, Z_LOCALITY_ENTER)).toBe("locality");
    expect(derivedLevelWithHysteresis("province", national, Z_LOCALITY_ENTER + 1)).toBe("locality");
  });

  it("national: crossing EXIT flips locality → province exactly once", () => {
    // Descending from locality, still inside the band → hold locality.
    expect(derivedLevelWithHysteresis("locality", national, Z_LOCALITY)).toBe("locality");
    // Below EXIT → fall back to province.
    expect(derivedLevelWithHysteresis("locality", national, Z_LOCALITY_EXIT - 0.01)).toBe(
      "province",
    );
    expect(derivedLevelWithHysteresis("locality", national, 3)).toBe("province");
  });

  it("national: oscillating INSIDE the dead-band produces ZERO flips (keeps prev)", () => {
    // A camera jittering across Z_LOCALITY but never past either edge holds level.
    const band = [Z_LOCALITY_EXIT, 4.8, Z_LOCALITY, 5.2, Z_LOCALITY_ENTER - 0.01];
    for (const z of band) {
      expect(derivedLevelWithHysteresis("province", national, z)).toBe("province");
      expect(derivedLevelWithHysteresis("locality", national, z)).toBe("locality");
    }
  });

  it("national: EXIT is inclusive of the band lower edge (>= EXIT holds prev)", () => {
    // Exactly EXIT is NOT below EXIT → stays in the band, holding prev.
    expect(derivedLevelWithHysteresis("locality", national, Z_LOCALITY_EXIT)).toBe("locality");
    expect(derivedLevelWithHysteresis("province", national, Z_LOCALITY_EXIT)).toBe("province");
  });

  it("scope wins over the camera and over prev — a jurisdiction drill is always locality", () => {
    expect(derivedLevelWithHysteresis("province", provinceScope, 2)).toBe("locality");
    expect(derivedLevelWithHysteresis("province", localityScope, 1)).toBe("locality");
    // Even a province-prev at a far-out zoom is locality once a scope is picked.
    expect(derivedLevelWithHysteresis("province", provinceScope, Z_LOCALITY_EXIT - 2)).toBe(
      "locality",
    );
  });
});

describe("shouldSnapFraming", () => {
  it("snaps a programmatic landing within ±0.5 of the flip", () => {
    expect(shouldSnapFraming(Z_LOCALITY)).toBe(true);
    expect(shouldSnapFraming(Z_LOCALITY - 0.5)).toBe(true);
    expect(shouldSnapFraming(Z_LOCALITY + 0.5)).toBe(true);
  });

  it("does NOT snap a landing comfortably clear of the flip", () => {
    expect(shouldSnapFraming(Z_LOCALITY - 0.51)).toBe(false);
    expect(shouldSnapFraming(Z_LOCALITY + 0.51)).toBe(false);
    expect(shouldSnapFraming(3)).toBe(false);
    expect(shouldSnapFraming(9.5)).toBe(false);
  });
});
