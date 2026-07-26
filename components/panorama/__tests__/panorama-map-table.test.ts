import { describe, expect, it } from "vitest";

import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import type { ActiveLayer } from "@/components/panorama/SituationalMap";
import {
  buildMapTableRows,
  sumSuppressedTableUnits,
  summarizeDockRecords,
} from "@/components/panorama/panorama-map-table";
import type { LayerId } from "@/src/modules/panorama/domain/types";

function cell(props: Record<string, unknown>) {
  return { type: "Feature" as const, geometry: null, properties: props };
}

function layer(over: Partial<ActiveLayer> & Pick<ActiveLayer, "id">): ActiveLayer {
  return {
    color: "#000",
    label: over.label ?? "Capa",
    geomType: "choropleth",
    features: { type: "FeatureCollection", features: [] },
    ...over,
  } as ActiveLayer;
}

describe("buildMapTableRows", () => {
  it("names a detail-tier cell by its own unit, never by its province (WARNING 5)", () => {
    const rows = buildMapTableRows([
      layer({
        id: "denuncias",
        label: "Denuncias",
        dataType: "density",
        level: "locality",
        features: {
          type: "FeatureCollection",
          features: [cell({ localityName: "Palermo", province: "CABA", value: 3 })],
        },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unit).toBe("Palermo");
  });

  it("says 'Protegido (k<5)' for a suppressed cell — never a number", () => {
    const rows = buildMapTableRows([
      layer({
        id: "denuncias",
        label: "Denuncias",
        dataType: "density",
        features: {
          type: "FeatureCollection",
          features: [cell({ name: "Chaco", suppressed: true, value: 3 })],
        },
      }),
    ]);
    expect(rows[0].value).toBe("Protegido (k<5)");
    expect(rows[0].value).not.toContain("3");
  });

  it("formats a locality-grain rate cell as a plain count (the '204%' bug)", () => {
    const rows = buildMapTableRows([
      layer({
        id: "cobertura",
        label: "Cobertura",
        dataType: "rate",
        level: "locality",
        complianceTarget: 80,
        features: {
          type: "FeatureCollection",
          features: [cell({ name: "Palermo", value: 204 })],
        },
      }),
    ]);
    expect(rows[0].value).not.toContain("%");
  });

  it("falls back to an em dash when a cell carries no identifiable unit", () => {
    const rows = buildMapTableRows([
      layer({
        id: "denuncias",
        label: "Denuncias",
        dataType: "density",
        features: { type: "FeatureCollection", features: [cell({ value: 1 })] },
      }),
    ]);
    expect(rows[0].unit).toBe("—");
  });
});

describe("summarizeDockRecords", () => {
  it("sums visible count cells, counts suppressed separately, and ignores rate layers", () => {
    const summary = summarizeDockRecords([
      layer({
        id: "denuncias",
        label: "Denuncias",
        dataType: "density",
        features: {
          type: "FeatureCollection",
          features: [
            cell({ name: "A", value: 10 }),
            cell({ name: "B", value: 0 }),
            cell({ name: "C", suppressed: true }),
          ],
        },
      }),
      layer({
        id: "cobertura",
        label: "Cobertura",
        dataType: "rate",
        features: {
          type: "FeatureCollection",
          features: [cell({ name: "A", value: 90 })],
        },
      }),
    ]);
    expect(summary).toEqual({
      hasCountLayer: true,
      total: 10,
      suppressed: 1,
      // A zero-event unit is NOT "a unit with events" — "0 eventos en 5 unidades"
      // used to contradict itself.
      unitsWithEvents: 1,
      anyPeriodLayer: true,
    });
  });

  it("reports no count layer when only rate layers are active", () => {
    const summary = summarizeDockRecords([
      layer({
        id: "cobertura",
        label: "Cobertura",
        dataType: "rate",
        features: { type: "FeatureCollection", features: [cell({ name: "A", value: 90 })] },
      }),
    ]);
    expect(summary.hasCountLayer).toBe(false);
    expect(summary.total).toBe(0);
  });

  it("flags a current-state stock (no period-flow layer) so the copy can say so", () => {
    const summary = summarizeDockRecords([
      layer({
        id: "mortalidad",
        label: "Mortalidad",
        dataType: "density",
        features: { type: "FeatureCollection", features: [cell({ name: "A", value: 4 })] },
      }),
    ]);
    expect(summary.anyPeriodLayer).toBe(false);
  });
});

describe("sumSuppressedTableUnits", () => {
  it("adds up the withheld units across the layers that feed the table", () => {
    const states = {
      denuncias: { suppressedCount: 4 },
      refugios: { suppressedCount: 9 },
    } as unknown as Record<LayerId, LayerPanelState>;
    const total = sumSuppressedTableUnits(
      [
        layer({ id: "denuncias", dataType: "density" }),
        // A reference point layer never tabulates — its count must not leak in.
        layer({ id: "refugios", geomType: "point", renderMode: "reference" }),
      ],
      states,
    );
    expect(total).toBe(4);
  });
});
