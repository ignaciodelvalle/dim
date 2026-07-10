// Tests for the drill-level place-label anchors (task #64).

import { describe, expect, it } from "vitest";

import { bboxCenter, divisionLabelAnchors } from "@/components/panorama/division-labels";

describe("bboxCenter", () => {
  it("centers a simple polygon on its bounding box", () => {
    const center = bboxCenter({
      type: "Polygon",
      coordinates: [
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2],
        ],
      ],
    });
    expect(center).toEqual([0, 0]);
  });

  it("spans all sub-polygons of a MultiPolygon", () => {
    const center = bboxCenter({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 0],
          ],
        ],
        [
          [
            [8, 8],
            [10, 8],
            [10, 10],
            [8, 8],
          ],
        ],
      ],
    });
    expect(center).toEqual([5, 5]);
  });

  it("returns null for an unsupported or empty geometry", () => {
    expect(bboxCenter(null)).toBeNull();
    expect(bboxCenter({ type: "Point", coordinates: [1, 2] })).toBeNull();
    expect(bboxCenter({ type: "Polygon", coordinates: [[]] })).toBeNull();
  });
});

describe("divisionLabelAnchors", () => {
  it("emits one anchor per feature with a code + name", () => {
    const anchors = divisionLabelAnchors([
      {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
              [-1, -1],
            ],
          ],
        },
        properties: { code: "02001", name: "Comuna 1" },
      },
    ]);
    expect(anchors).toEqual([{ code: "02001", name: "Comuna 1", lng: 0, lat: 0 }]);
  });

  it("skips features missing a code, name, or center", () => {
    const anchors = divisionLabelAnchors([
      { geometry: { type: "Polygon", coordinates: [[[0, 0]]] }, properties: { name: "Sin code" } },
      { geometry: { type: "Polygon", coordinates: [[[0, 0]]] }, properties: { code: "1" } },
      { geometry: null, properties: { code: "1", name: "Sin geom" } },
    ]);
    expect(anchors).toEqual([]);
  });
});
