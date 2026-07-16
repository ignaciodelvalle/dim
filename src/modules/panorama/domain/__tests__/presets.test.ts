// Unit tests for Panorama F3 presets (pure domain).
//
// Verifies:
//   1. Structural integrity — each preset has a unique id, non-empty label,
//      exactly 1 base, ≤1 signal, and all layer ids exist in PANORAMA_LAYERS.
//   2. F2 compatibility — activating layers in the order [base, signal, refs]
//      is allowed at every step (no preset may violate the compatibility model).
//   3. presetLayerIds() returns the expected ordered set.

import { describe, expect, it } from "vitest";

import { checkCompatibility } from "@/src/modules/panorama/domain/compatibility";
import { roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import {
  DEFAULT_PANORAMA_PRESET_ID,
  PANORAMA_PRESETS,
  type PanoramaPreset,
  type PresetFraming,
  getPreset,
  presetLayerIds,
  shouldEmitPresetFrame,
} from "@/src/modules/panorama/domain/presets";
import type { LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

// ---------------------------------------------------------------------------
// Catalogue integrity
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — catalogue integrity", () => {
  it("contains exactly 6 presets", () => {
    expect(PANORAMA_PRESETS).toHaveLength(6);
  });

  it("all preset ids are unique", () => {
    const ids = PANORAMA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all 6 expected preset ids are present", () => {
    const ids = new Set(PANORAMA_PRESETS.map((p) => p.id));
    expect(ids.has("brotes-activos")).toBe(true);
    expect(ids.has("sintomas")).toBe(true);
    expect(ids.has("cumplimiento")).toBe(true);
    expect(ids.has("bienestar")).toBe(true);
    expect(ids.has("control-poblacional")).toBe(true);
    expect(ids.has("perdidas-reunificacion")).toBe(true);
  });

  it("every preset has a non-empty label", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(p.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("every preset has a non-empty description", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(p.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("every preset has a valid aggregation level", () => {
    const validLevels = new Set(["province", "locality"]);
    for (const p of PANORAMA_PRESETS) {
      expect(validLevels.has(p.level)).toBe(true);
    }
  });

  it("every preset has a valid periodPreset", () => {
    const validPeriods = new Set(["30d", "90d"]);
    for (const p of PANORAMA_PRESETS) {
      expect(validPeriods.has(p.periodPreset)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Layer-id validity — all referenced ids exist in PANORAMA_LAYERS
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — layer id validity", () => {
  const knownIds = new Set<LayerId>(PANORAMA_LAYERS.map((l) => l.id));

  it("every preset's base id exists in PANORAMA_LAYERS", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(knownIds.has(p.base)).toBe(true);
    }
  });

  it("every preset's signal id (if set) exists in PANORAMA_LAYERS", () => {
    for (const p of PANORAMA_PRESETS) {
      if (p.signal !== undefined) {
        expect(knownIds.has(p.signal)).toBe(true);
      }
    }
  });

  it("every reference id in each preset exists in PANORAMA_LAYERS", () => {
    for (const p of PANORAMA_PRESETS) {
      for (const refId of p.references ?? []) {
        expect(knownIds.has(refId)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Role constraints — exactly 1 base, ≤1 signal per preset
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — role constraints", () => {
  it("every preset has exactly 1 base layer", () => {
    for (const p of PANORAMA_PRESETS) {
      const ids = presetLayerIds(p);
      const baseLayers = ids.filter((id) => {
        const layer = PANORAMA_LAYERS.find((l) => l.id === id);
        return layer ? roleOf(layer) === "base" : false;
      });
      expect(baseLayers).toHaveLength(1);
      expect(baseLayers[0]).toBe(p.base);
    }
  });

  it("every preset has at most 1 signal layer", () => {
    for (const p of PANORAMA_PRESETS) {
      const ids = presetLayerIds(p);
      const signalLayers = ids.filter((id) => {
        const layer = PANORAMA_LAYERS.find((l) => l.id === id);
        return layer ? roleOf(layer) === "signal" : false;
      });
      expect(signalLayers.length).toBeLessThanOrEqual(1);
      if (p.signal !== undefined) {
        expect(signalLayers[0]).toBe(p.signal);
      }
    }
  });

  it("all reference layers in each preset have role 'reference'", () => {
    for (const p of PANORAMA_PRESETS) {
      for (const refId of p.references ?? []) {
        const layer = PANORAMA_LAYERS.find((l) => l.id === refId);
        expect(layer).toBeDefined();
        expect(roleOf(layer!)).toBe("reference");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// F2 compatibility — each preset's activation sequence is fully allowed
// ---------------------------------------------------------------------------

// Replays the activation order [base, signal?, ...references?] through
// checkCompatibility, asserting allowed:true at each step.
function assertPresetIsCompatible(p: PanoramaPreset) {
  const activationOrder = presetLayerIds(p);
  const accumulated: LayerId[] = [];
  for (const id of activationOrder) {
    const result = checkCompatibility(accumulated, id, PANORAMA_LAYERS);
    expect(result.allowed).toBe(true);
    accumulated.push(id);
  }
}

describe("PANORAMA_PRESETS — F2 compatibility (activation sequence)", () => {
  it("brotes-activos: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "brotes-activos")!;
    assertPresetIsCompatible(p);
  });

  it("sintomas: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "sintomas")!;
    assertPresetIsCompatible(p);
  });

  it("cumplimiento: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "cumplimiento")!;
    assertPresetIsCompatible(p);
  });

  it("bienestar: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "bienestar")!;
    assertPresetIsCompatible(p);
  });

  it("control-poblacional: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "control-poblacional")!;
    assertPresetIsCompatible(p);
  });

  it("perdidas-reunificacion: each layer in activation order is allowed by checkCompatibility", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "perdidas-reunificacion")!;
    assertPresetIsCompatible(p);
  });

  it("all 6 presets pass the compatibility replay (parametric)", () => {
    for (const p of PANORAMA_PRESETS) {
      assertPresetIsCompatible(p);
    }
  });
});

// ---------------------------------------------------------------------------
// presetLayerIds()
// ---------------------------------------------------------------------------

describe("presetLayerIds()", () => {
  it("returns [base] for a preset with no signal and no references", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "cumplimiento")!;
    // cumplimiento: base only
    expect(presetLayerIds(p)).toEqual([p.base]);
  });

  it("returns [base, signal] for a preset with a signal and no references", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "brotes-activos")!;
    expect(presetLayerIds(p)).toEqual([p.base, p.signal]);
  });

  it("returns [base, signal] for sintomas", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "sintomas")!;
    expect(presetLayerIds(p)).toEqual([p.base, p.signal]);
  });

  it("returns [base, signal] for perdidas-reunificacion", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "perdidas-reunificacion")!;
    expect(presetLayerIds(p)).toEqual([p.base, p.signal]);
    expect(p.base).toBe("perdidas");
    expect(p.signal).toBe("reunificacion");
  });

  it("returns [base, ...references] for bienestar (no signal)", () => {
    const p = PANORAMA_PRESETS.find((x) => x.id === "bienestar")!;
    expect(presetLayerIds(p)).toEqual([p.base, ...(p.references ?? [])]);
    expect(p.signal).toBeUndefined();
  });

  it("base is always the first element", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(presetLayerIds(p)[0]).toBe(p.base);
    }
  });

  it("result length equals 1 + (signal ? 1 : 0) + references.length", () => {
    for (const p of PANORAMA_PRESETS) {
      const expectedLength = 1 + (p.signal ? 1 : 0) + (p.references?.length ?? 0);
      expect(presetLayerIds(p)).toHaveLength(expectedLength);
    }
  });
});

// ---------------------------------------------------------------------------
// framing (panorama-redesign Fase 1) — optional map-framing field
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — optional framing field", () => {
  it("national-overview presets carry the national framing (design-QA 2026-07-04 expansion)", () => {
    // brotes-activos (Fase 1 demonstrator) + the two province-choropleth
    // compliance presets — all three answer a cross-province question.
    for (const id of ["brotes-activos", "cumplimiento", "control-poblacional"] as const) {
      expect(getPreset(id)!.framing).toEqual({ kind: "national" });
    }
  });

  it("locality-level drill-down presets omit framing (map behavior unchanged)", () => {
    for (const id of ["sintomas", "bienestar", "perdidas-reunificacion"] as const) {
      expect(getPreset(id)!.framing).toBeUndefined();
    }
  });

  it("at least one shipped preset carries a non-null framing value (spec scenario)", () => {
    expect(PANORAMA_PRESETS.some((p) => p.framing != null)).toBe(true);
  });

  it("a framing value, when present, is a valid PresetFraming shape", () => {
    for (const p of PANORAMA_PRESETS) {
      if (p.framing === undefined) continue;
      if (p.framing.kind === "national") continue;
      // bbox framing must carry [[minLng,minLat],[maxLng,maxLat]].
      expect(p.framing.kind).toBe("bbox");
      expect(p.framing.bounds).toHaveLength(2);
      expect(p.framing.bounds[0]).toHaveLength(2);
      expect(p.framing.bounds[1]).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// shouldEmitPresetFrame — vista-switch camera-yank fix
// ---------------------------------------------------------------------------

describe("shouldEmitPresetFrame", () => {
  const national: PresetFraming = { kind: "national" };
  const bbox: PresetFraming = {
    kind: "bbox",
    bounds: [
      [-60, -35],
      [-58, -34],
    ],
  };

  it("suppresses a national frame when the operator has an active scope", () => {
    // The core bug: switching a nationally-framed vista while drilled/scoped
    // must NOT teleport the camera to the whole country.
    expect(shouldEmitPresetFrame(national, true)).toBe(false);
  });

  it("emits a national frame only from a neutral (national) context", () => {
    expect(shouldEmitPresetFrame(national, false)).toBe(true);
  });

  it("always emits an explicit bbox frame — a deliberate intent, not a default", () => {
    expect(shouldEmitPresetFrame(bbox, true)).toBe(true);
    expect(shouldEmitPresetFrame(bbox, false)).toBe(true);
  });

  it("emits nothing for a framing-less preset (caller clears the frame)", () => {
    expect(shouldEmitPresetFrame(undefined, true)).toBe(false);
    expect(shouldEmitPresetFrame(null, false)).toBe(false);
  });

  it("every shipped national-framed preset is suppressed under an active scope", () => {
    // Guards the three national vistas (brotes-activos, cumplimiento,
    // control-poblacional) against re-introducing the yank.
    for (const p of PANORAMA_PRESETS) {
      if (p.framing?.kind === "national") {
        expect(shouldEmitPresetFrame(p.framing, true)).toBe(false);
        expect(shouldEmitPresetFrame(p.framing, false)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_PANORAMA_PRESET_ID (design-QA 2026-07-04 fast-follow)
// ---------------------------------------------------------------------------

describe("DEFAULT_PANORAMA_PRESET_ID", () => {
  it("resolves to a catalogued preset", () => {
    expect(getPreset(DEFAULT_PANORAMA_PRESET_ID)).toBeDefined();
  });

  it("lands on the proven-populated welfare preset so the first paint shows data", () => {
    // QA histórico 2026-07-08: the previous default `cumplimiento` (base
    // cobertura, the antirrábica RATE) painted an EMPTY map in this build — the
    // rabies-coverage rate lacks data — so the operator's first panorama load was
    // blank. `bienestar` (base denuncias, welfare-report density) reliably draws
    // with divisions, so the landing shows data instead of "Sin datos".
    const p = getPreset(DEFAULT_PANORAMA_PRESET_ID)!;
    expect(p.id).toBe("bienestar");
    // The welfare preset draws at locality granularity and stays framing-less
    // (a drill-down question, not a national choropleth overview).
    expect(p.base).toBe("denuncias");
  });
});

// ---------------------------------------------------------------------------
// getPreset()
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// metrics (panorama-vista-redesign — per-vista metrics column)
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — metrics field", () => {
  const KNOWN_KPI_IDS: readonly PanoramaKpiId[] = [
    "cobertura",
    "esterilizacion",
    "microchip",
    "perdidas",
    "reunificacion",
    "mordeduras",
    "zoonosis",
    "denuncias",
    "mascotas",
  ];

  it("every preset has 2-4 decision metrics", () => {
    // metric-honesty 2026-07-09: the coverage denominator ("mascotas") left the
    // per-vista lists for the shared footer caption, so a preset can now carry
    // as few as 2 decision metrics.
    for (const p of PANORAMA_PRESETS) {
      expect(p.metrics.length).toBeGreaterThanOrEqual(2);
      expect(p.metrics.length).toBeLessThanOrEqual(4);
    }
  });

  it("no preset lists the coverage denominator (mascotas) — it is a footer caption", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(p.metrics).not.toContain("mascotas");
    }
  });

  it("every metric id is a known PanoramaKpiId", () => {
    for (const p of PANORAMA_PRESETS) {
      for (const id of p.metrics) {
        expect(KNOWN_KPI_IDS).toContain(id);
      }
    }
  });

  it("no preset has duplicate metrics", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(new Set(p.metrics).size).toBe(p.metrics.length);
    }
  });

  it("bienestar → control-poblacional shows the expected metrics (spec table)", () => {
    expect(getPreset("bienestar")!.metrics).toEqual(["denuncias", "mordeduras"]);
    expect(getPreset("control-poblacional")!.metrics).toEqual(["esterilizacion", "perdidas"]);
  });

  // v+1 rail: meta-progress meters headline the presets they were built for.
  it("cumplimiento includes microchip (target-progress meter alongside cobertura/esterilizacion)", () => {
    expect(getPreset("cumplimiento")!.metrics).toEqual([
      "cobertura",
      "esterilizacion",
      "microchip",
    ]);
  });

  it("perdidas-reunificacion includes reunificacion (the D4 rate the preset is named for)", () => {
    expect(getPreset("perdidas-reunificacion")!.metrics).toEqual([
      "perdidas",
      "reunificacion",
      "denuncias",
    ]);
  });
});

describe("getPreset()", () => {
  it("returns the correct preset for each known id", () => {
    for (const p of PANORAMA_PRESETS) {
      expect(getPreset(p.id)).toBe(p);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getPreset("unknown" as never)).toBeUndefined();
  });
});
