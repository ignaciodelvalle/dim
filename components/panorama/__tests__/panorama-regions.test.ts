// Tests for the regional camera frames + the semantic scroll-nav state machine
// (task #36 fix 5 + addendum). Pure — no map, no DOM.

import { describe, expect, it } from "vitest";

import {
  type NavState,
  PANORAMA_REGIONS,
  frameForNavState,
  regionAtPoint,
  regionBboxUnion,
  regionForProvince,
  regionFrameBbox,
  resolveScrollNav,
} from "@/components/panorama/panorama-regions";
import type { ProvinceBbox } from "@/components/panorama/situational-map-utils";

describe("region taxonomy", () => {
  it("covers all 24 jurisdictions exactly once", () => {
    const all = PANORAMA_REGIONS.flatMap((r) => r.provinces);
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
  });

  it("maps a province to its region", () => {
    expect(regionForProvince("AR-V")).toBe("patagonia"); // Tierra del Fuego
    expect(regionForProvince("AR-C")).toBe("centro"); // CABA
    expect(regionForProvince("AR-B")).toBe("centro"); // PBA
    expect(regionForProvince("AR-Y")).toBe("norte"); // Jujuy
    expect(regionForProvince("AR-M")).toBe("cuyo"); // Mendoza
    expect(regionForProvince(null)).toBeNull();
    expect(regionForProvince("AR-ZZ")).toBeNull();
  });
});

describe("regionBboxUnion", () => {
  const bboxes: ProvinceBbox[] = [
    {
      code: "AR-Q",
      bbox: [
        [-71, -41],
        [-68, -36],
      ],
    }, // Neuquén
    {
      code: "AR-V",
      bbox: [
        [-69, -55],
        [-57, -52],
      ],
    }, // TdF incl. Malvinas (east)
    {
      code: "AR-M",
      bbox: [
        [-70, -37],
        [-67, -32],
      ],
    }, // Mendoza (other region)
  ];

  it("unions member province bboxes, reaching Malvinas via AR-V", () => {
    const union = regionBboxUnion("patagonia", bboxes);
    expect(union).not.toBeNull();
    // West edge from Neuquén, east edge from TdF's Malvinas rings, south from TdF.
    expect(union?.[0][0]).toBe(-71);
    expect(union?.[1][0]).toBe(-57);
    expect(union?.[0][1]).toBe(-55);
  });

  it("returns null when no member bbox is available", () => {
    expect(regionBboxUnion("norte", bboxes)).toBeNull();
  });
});

// MED 9 (adversarial QA 2026-07-11): the Malvinas claim (AR-V east edge) must
// stay in the hit-test union but be capped out of the CAMERA frame so Patagonia
// doesn't stretch east over empty ocean. Uses the REAL continental east edges
// (Río Negro Atlantic coast ≈ -62.79) vs AR-V's Malvinas east (≈ -57.79).
describe("regionFrameBbox — MED 9 Malvinas frame clamp", () => {
  const bboxes: ProvinceBbox[] = [
    {
      code: "AR-Q",
      bbox: [
        [-71.96, -41.1],
        [-68.0, -36.05],
      ],
    }, // Neuquén
    {
      code: "AR-R",
      bbox: [
        [-71.91, -42.0],
        [-62.79, -37.57],
      ],
    }, // Río Negro (Atlantic)
    {
      code: "AR-U",
      bbox: [
        [-72.19, -46.0],
        [-63.59, -42.0],
      ],
    }, // Chubut
    {
      code: "AR-Z",
      bbox: [
        [-73.56, -52.4],
        [-65.72, -46.0],
      ],
    }, // Santa Cruz
    {
      code: "AR-V",
      bbox: [
        [-68.61, -55.06],
        [-57.79, -51.27],
      ],
    }, // TdF incl. Malvinas
    {
      code: "AR-M",
      bbox: [
        [-70, -37],
        [-67, -32],
      ],
    }, // Mendoza (other region)
  ];

  it("caps the frame east edge to the continental coast, dropping the Malvinas ocean gap", () => {
    const frame = regionFrameBbox("patagonia", bboxes);
    expect(frame).not.toBeNull();
    // East edge clamped to Río Negro's Atlantic coast, NOT AR-V's Malvinas east.
    expect(frame?.[1][0]).toBeCloseTo(-62.79, 2);
    // South tip (AR-V / TdF island) is preserved — TdF still frames.
    expect(frame?.[0][1]).toBeCloseTo(-55.06, 2);
    // West + north come from the full union (Santa Cruz / Neuquén).
    expect(frame?.[0][0]).toBeCloseTo(-73.56, 2);
    expect(frame?.[1][1]).toBeCloseTo(-36.05, 2);
  });

  it("leaves the true union (incl. Malvinas) intact for hit-testing", () => {
    // regionBboxUnion still reaches AR-V's Malvinas east edge — clicking over the
    // islands must still resolve to Patagonia.
    expect(regionBboxUnion("patagonia", bboxes)?.[1][0]).toBeCloseTo(-57.79, 2);
  });

  it("is identical to the union for a region with no claim-ring member", () => {
    expect(regionFrameBbox("cuyo", bboxes)).toEqual(regionBboxUnion("cuyo", bboxes));
  });

  it("returns null when no member bbox is loaded", () => {
    expect(regionFrameBbox("norte", bboxes)).toBeNull();
  });
});

describe("regionAtPoint", () => {
  const bboxes: ProvinceBbox[] = [
    {
      code: "AR-Q",
      bbox: [
        [-71, -41],
        [-68, -36],
      ],
    },
    {
      code: "AR-M",
      bbox: [
        [-70, -37],
        [-67, -32],
      ],
    },
  ];
  it("resolves the region whose union contains the point", () => {
    expect(regionAtPoint([-69, -39], bboxes)).toBe("patagonia"); // in Neuquén
    expect(regionAtPoint([-68, -34], bboxes)).toBe("cuyo"); // in Mendoza
  });

  // MED 8 (adversarial QA 2026-07-11): a wide Patagonia∪Malvinas frame can put
  // the viewport centre in the South Atlantic — no union contains it. The
  // nearest-member fallback (doc promise, previously unimplemented) keeps
  // wheel-IN responsive instead of wedging, returning the nearest region.
  it("falls back to the NEAREST member region when the point is outside every union (ocean)", () => {
    // Far south-east of both bboxes (open water); AR-Q (patagonia) centroid is
    // closer than AR-M (cuyo).
    expect(regionAtPoint([-60, -50], bboxes)).toBe("patagonia");
  });

  it("returns null only when no province bboxes are loaded yet", () => {
    expect(regionAtPoint([-60, -50], [])).toBeNull();
  });
});

describe("resolveScrollNav — OUT chain (localidad → provincia → región → nación)", () => {
  const opts = { provinceAtCenter: null, regionAtCenter: null };

  it("localidad → provincia", () => {
    const cur: NavState = { province: "AR-X", locality: "cordoba-capital", region: null };
    expect(resolveScrollNav({ current: cur, direction: "out", ...opts })).toEqual({
      province: "AR-X",
      locality: null,
      region: null,
    });
  });

  it("provincia → región (national data, region focus on the province's region)", () => {
    const cur: NavState = { province: "AR-U", locality: null, region: null }; // Chubut
    expect(resolveScrollNav({ current: cur, direction: "out", ...opts })).toEqual({
      province: null,
      locality: null,
      region: "patagonia",
    });
  });

  it("región → nación", () => {
    const cur: NavState = { province: null, locality: null, region: "norte" };
    expect(resolveScrollNav({ current: cur, direction: "out", ...opts })).toEqual({
      province: null,
      locality: null,
      region: null,
    });
  });

  it("nación → nada (already at the top)", () => {
    const cur: NavState = { province: null, locality: null, region: null };
    expect(resolveScrollNav({ current: cur, direction: "out", ...opts })).toBeNull();
  });
});

describe("resolveScrollNav — IN chain (nación → región → provincia)", () => {
  it("nación → región (picks the region under the viewport centre)", () => {
    const cur: NavState = { province: null, locality: null, region: null };
    expect(
      resolveScrollNav({
        current: cur,
        direction: "in",
        provinceAtCenter: null,
        regionAtCenter: "cuyo",
      }),
    ).toEqual({ province: null, locality: null, region: "cuyo" });
  });

  it("región → provincia (commits the province under the viewport centre)", () => {
    const cur: NavState = { province: null, locality: null, region: "cuyo" };
    expect(
      resolveScrollNav({
        current: cur,
        direction: "in",
        provinceAtCenter: "AR-M",
        regionAtCenter: "cuyo",
      }),
    ).toEqual({ province: "AR-M", locality: null, region: null });
  });

  it("provincia → nada on zoom-in (localities are click-drilled, not auto)", () => {
    const cur: NavState = { province: "AR-M", locality: null, region: null };
    expect(
      resolveScrollNav({
        current: cur,
        direction: "in",
        provinceAtCenter: "AR-M",
        regionAtCenter: "cuyo",
      }),
    ).toBeNull();
  });

  it("no-op when nothing resolves under the viewport centre", () => {
    const cur: NavState = { province: null, locality: null, region: null };
    expect(
      resolveScrollNav({
        current: cur,
        direction: "in",
        provinceAtCenter: null,
        regionAtCenter: null,
      }),
    ).toBeNull();
  });
});

describe("frameForNavState", () => {
  const bboxes: ProvinceBbox[] = [
    {
      code: "AR-M",
      bbox: [
        [-70, -37],
        [-67, -32],
      ],
    },
    {
      code: "AR-J",
      bbox: [
        [-70, -32],
        [-67, -28],
      ],
    },
    {
      code: "AR-D",
      bbox: [
        [-67, -36],
        [-64, -32],
      ],
    },
  ];
  const national: [[number, number], [number, number]] = [
    [-73, -55],
    [-53, -21],
  ];

  it("frames a province by its bbox", () => {
    expect(
      frameForNavState({ province: "AR-M", locality: null, region: null }, bboxes, national),
    ).toEqual([
      [-70, -37],
      [-67, -32],
    ]);
  });

  it("frames a region by its member union (Cuyo = M ∪ J ∪ D)", () => {
    expect(
      frameForNavState({ province: null, locality: null, region: "cuyo" }, bboxes, national),
    ).toEqual([
      [-70, -37],
      [-64, -28],
    ]);
  });

  it("frames national when no scope/region", () => {
    expect(
      frameForNavState({ province: null, locality: null, region: null }, bboxes, national),
    ).toEqual(national);
  });
});
