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
