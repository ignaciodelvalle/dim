// Unit tests for derivedLevel — the aggregation level is now DERIVED from
// (scope, zoom), not a manual toggle (panorama-ia-v2 §1.1, PO decision #1:
// BOTH zoom and scope trigger locality; prefer precision when it renders).

import { describe, expect, it } from "vitest";

import type { PanoramaScope } from "@/src/modules/panorama/domain/types";

import { derivedLevel } from "../situational-map-utils";

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
