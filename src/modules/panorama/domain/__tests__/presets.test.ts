// Unit tests for Panorama F3 presets (pure domain).
//
// Verifies:
//   1. Structural integrity — each preset has a unique id, non-empty label,
//      exactly 1 base, ≤1 signal, and all layer ids exist in PANORAMA_LAYERS.
//   2. F2 compatibility — activating layers in the order [base, signal, refs]
//      is allowed at every step (no preset may violate the compatibility model).
//   3. presetLayerIds() returns the expected ordered set.

import { describe, expect, it } from "vitest";

import { isDeclaredBivariatePair } from "@/src/modules/panorama/domain/bivariate";
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
  it("contains exactly 14 presets", () => {
    expect(PANORAMA_PRESETS).toHaveLength(14);
  });

  it("all preset ids are unique", () => {
    const ids = PANORAMA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all 14 expected preset ids are present", () => {
    const ids = new Set(PANORAMA_PRESETS.map((p) => p.id));
    expect(ids.has("brotes-activos")).toBe(true);
    expect(ids.has("sintomas")).toBe(true);
    expect(ids.has("cumplimiento")).toBe(true);
    // Orphaned-layer wiring: dedicated PPP + mortality vistas.
    expect(ids.has("registro-ppp")).toBe(true);
    expect(ids.has("bienestar")).toBe(true);
    expect(ids.has("control-poblacional")).toBe(true);
    expect(ids.has("mortalidad")).toBe(true);
    expect(ids.has("perdidas-reunificacion")).toBe(true);
    // New-vistas wave (PO 2026-07-18): the vet-activity recency vista.
    expect(ids.has("desierto-veterinario")).toBe(true);
    expect(ids.has("tendencia")).toBe(true);
    expect(ids.has("riesgo-ppp")).toBe(true);
    // Orphan-wiring wave (2026-07-26): the two rate layers that had a loader,
    // tests and production call sites but no vista that activated them.
    expect(ids.has("microchip")).toBe(true);
    expect(ids.has("antiparasitario")).toBe(true);
    // Polarity wave (2026-07-26): the composite scorecard, wirable once a
    // higher-is-better layer could be ranked and painted without inverting.
    expect(ids.has("indice-territorial")).toBe(true);
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
  it("every preset has exactly 1 base layer (declared bivariate pairs: 2)", () => {
    for (const p of PANORAMA_PRESETS) {
      const ids = presetLayerIds(p);
      const baseLayers = ids.filter((id) => {
        const layer = PANORAMA_LAYERS.find((l) => l.id === id);
        return layer ? roleOf(layer) === "base" : false;
      });
      // new-vistas wave: a preset whose overlay slot rides a DECLARED bivariate
      // pair with a BASE-ROLE overlay (riesgo-ppp: mordeduras, density, over
      // ppp) legally carries a second base-role layer — exactly the F2
      // exception checkCompatibility admits. brotes-activos is also a declared
      // pair but its overlay (zoonosis) is signal-role, so it keeps the 1-base
      // contract.
      const signalLayer =
        p.signal !== undefined ? PANORAMA_LAYERS.find((l) => l.id === p.signal) : undefined;
      if (
        p.signal !== undefined &&
        signalLayer !== undefined &&
        roleOf(signalLayer) === "base" &&
        isDeclaredBivariatePair(p.base, p.signal)
      ) {
        expect(baseLayers.sort()).toEqual([p.base, p.signal].sort());
        continue;
      }
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
        const overlay = PANORAMA_LAYERS.find((l) => l.id === p.signal);
        // A declared-pair BASE-ROLE overlay (riesgo-ppp: mordeduras) never
        // occupies the signal-role slot — nothing to assert against it.
        if (overlay !== undefined && roleOf(overlay) === "base") {
          expect(isDeclaredBivariatePair(p.base, p.signal)).toBe(true);
        } else {
          expect(signalLayers[0]).toBe(p.signal);
        }
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
    // brotes-activos (Fase 1 demonstrator) + the province-choropleth compliance /
    // population presets — all answer a cross-province question. Orphaned-layer
    // wiring adds two more national vistas: registro-ppp and mortalidad.
    for (const id of [
      "brotes-activos",
      "cumplimiento",
      "antiparasitario",
      "microchip",
      "registro-ppp",
      "control-poblacional",
      "mortalidad",
      "desierto-veterinario",
      "tendencia",
      "riesgo-ppp",
    ] as const) {
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
    // Guards every national-framed vista (brotes-activos, cumplimiento,
    // control-poblacional, registro-ppp, mortalidad) against re-introducing
    // the yank. The loop covers all presets, so new ones are guarded too.
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
    "ppp",
    "perdidas",
    "reunificacion",
    "mordeduras",
    "zoonosis",
    "denuncias",
    "mortalidad",
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

  it("perdidas-reunificacion headlines perdidas + reunificacion, WITHOUT off-mission denuncias", () => {
    // red-team-admin-2 P1.6: "denuncias" (bienestar/welfare-complaints) was
    // dropped — a different domain than lost-and-reunification that confused the
    // lens. Only the two on-mission metrics remain.
    expect(getPreset("perdidas-reunificacion")!.metrics).toEqual(["perdidas", "reunificacion"]);
  });

  // Orphaned-layer wiring: the PPP + mortality vistas headline their own layer's KPI.
  it("registro-ppp surfaces the PPP layer as base and headlines ppp (Ley Prov 14.107 family)", () => {
    const p = getPreset("registro-ppp")!;
    expect(p.base).toBe("ppp");
    expect(p.metrics).toEqual(["ppp", "microchip"]);
  });

  it("mortalidad surfaces the mortalidad layer as base and headlines mortalidad", () => {
    const p = getPreset("mortalidad")!;
    expect(p.base).toBe("mortalidad");
    expect(p.metrics).toEqual(["mortalidad", "esterilizacion"]);
  });

  // Orphan-wiring wave (2026-07-26).
  it("microchip surfaces the microchip layer as base and headlines its own KPI first", () => {
    // The layer was the most-referenced orphan in the codebase (195 production
    // files) and a headline legal KPI on /gob, with no way to see it
    // territorially. Its own indicator LEADS the column — the vista is not
    // allowed to headline a neighbour's metric.
    const p = getPreset("microchip")!;
    expect(p.base).toBe("microchip");
    expect(p.metrics[0]).toBe("microchip");
    expect(p.metrics).toEqual(["microchip", "ppp"]);
  });

  it("antiparasitario surfaces the deworming layer as base", () => {
    const p = getPreset("antiparasitario")!;
    expect(p.base).toBe("antiparasitario");
    // KNOWN GAP, asserted so it is not mistaken for an oversight: there is no
    // `antiparasitario` PanoramaKpiId (get-panorama-kpis emits no deworming
    // tile), so this vista cannot list its own indicator yet. When that KPI
    // lands, this expectation should FLIP to `metrics[0] === "antiparasitario"`.
    expect(p.metrics).toEqual(["zoonosis", "cobertura"]);
    expect(p.metrics).not.toContain("antiparasitario" as never);
  });
});

// ---------------------------------------------------------------------------
// Layer reachability — the orphan audit, locked (scripts/inventory-reachability)
// ---------------------------------------------------------------------------

describe("PANORAMA_PRESETS — layer reachability", () => {
  const activated = new Set<LayerId>(PANORAMA_PRESETS.flatMap((p) => presetLayerIds(p)));

  /**
   * The layers NO vista activates. An orphaned layer is invisible to every
   * operator no matter how well it is built or tested, so this set is pinned:
   * adding a layer without a vista, or dropping a layer out of its only vista,
   * must fail here and force an explicit decision.
   *
   * WAS ["acceso-veterinario", "indice-territorial"] — both "higher is better"
   * layers that the console read backwards. `indice-territorial` is now wired:
   * its 0-100 score has a DEFINITIONAL meta of 100 (the three metas met), and a
   * declared target is a polarity declaration the existing call sites already
   * pass through, so it ranks worst-gap-first and fills on the META scale.
   *
   * `acceso-veterinario` survives DELIBERATELY. Its polarity is declared
   * (`higherIsBetter: true`) and both mechanisms exist — the ranking honours it
   * and `computeClassScale({ invert })` reverses the ramp — but the two consumer
   * reads that would carry it (PanoramaConsole's inline rank options,
   * provinceSeqClassScale's `computeClassScale` call) still do not pass it, and
   * it has no honest target to ride instead. Wiring it today would list the ten
   * BEST-served jurisdictions as "las peores" and paint them the alarm colour.
   * An orphan with a written reason beats a vista that lies; see the rationale
   * block on the `desierto-veterinario` preset for the two one-argument fixes.
   */
  const KNOWN_ORPHANS: readonly LayerId[] = ["acceso-veterinario"];

  it("only the documented consumer-blocked layer is orphaned", () => {
    const orphans = PANORAMA_LAYERS.map((l) => l.id).filter((id) => !activated.has(id));
    expect(orphans.sort()).toEqual([...KNOWN_ORPHANS].sort());
  });

  it("the territorial index has a vista — it ranks by attainment, not by magnitude", () => {
    expect(activated.has("indice-territorial")).toBe(true);
    // The pairing is only honest because the layer declares its meta: without a
    // target the console would rank a higher-is-better score descending.
    expect(PANORAMA_LAYERS.find((l) => l.id === "indice-territorial")?.complianceTarget).toBe(100);
  });

  it("microchip is reachable — the legal headline KPI now has a territorial home", () => {
    expect(activated.has("microchip")).toBe(true);
  });

  it("the installed-capacity directories hang off the vet-desert diagnosis", () => {
    // PO 2026-07-25: "capacidad instalada NO es presupuesto" — clinics and
    // shelters are showable, and they are what turns "Desierto veterinario"
    // into a diagnosis with a plan.
    const p = getPreset("desierto-veterinario")!;
    expect(p.references).toEqual(["clinicas", "refugios"]);
    expect(presetLayerIds(p)).toEqual(["desierto-veterinario", "clinicas", "refugios"]);
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
