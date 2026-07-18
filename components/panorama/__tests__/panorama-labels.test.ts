import { describe, expect, it } from "vitest";

import {
  activeVistaName,
  countFiltroModifiers,
  describeCapasMeta,
  filtroBadgeAriaLabel,
  legendRampTitle,
  shortKpiLabel,
  shortLayerLabel,
} from "@/components/panorama/panorama-labels";
import { PANORAMA_DEFAULT_PRESET } from "@/lib/analytics/analytics-period";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import { PANORAMA_PRESETS, presetLayerIds } from "@/src/modules/panorama/domain/presets";
import type { PanoramaKpiId } from "@/src/modules/panorama/domain/types";

// Canonical KPI labels (mirror get-panorama-kpis.ts — kept here so the de-dup
// snapshot documents the BEFORE→AFTER without importing the server module).
const CANONICAL_KPI: Record<PanoramaKpiId, string> = {
  cobertura: "Cobertura antirrábica (perros, 12m)",
  esterilizacion: "Cobertura de esterilización",
  microchip: "Microchip",
  ppp: "Registro PPP",
  perdidas: "Pérdidas activas",
  reunificacion: "Tasa de reunificación",
  mordeduras: "Mordeduras / 10k hab.",
  zoonosis: "Zoonosis activas",
  denuncias: "Denuncias activas",
  mortalidad: "Mortalidad registrada",
  mascotas: "Mascotas en cobertura",
};

describe("activeVistaName", () => {
  it("returns the preset label, or null in manual mode", () => {
    expect(activeVistaName("perdidas-reunificacion")).toBe("Pérdidas y reunificación");
    expect(activeVistaName(null)).toBeNull();
  });
});

describe("de-dup — shortKpiLabel / shortLayerLabel", () => {
  it('drops the vista stem: "Pérdidas activas" → "Activas" under Pérdidas y reunificación', () => {
    expect(shortKpiLabel("perdidas-reunificacion", "perdidas", CANONICAL_KPI.perdidas)).toBe(
      "Activas",
    );
  });

  it("keeps semantically-risky labels canonical (Tasa de reunificación)", () => {
    expect(
      shortKpiLabel("perdidas-reunificacion", "reunificacion", CANONICAL_KPI.reunificacion),
    ).toBe("Tasa de reunificación");
  });

  it("shortens layer rows under the vista heading", () => {
    expect(shortLayerLabel("sintomas", "sintomas", getLayer("sintomas")!.label)).toBe("Síntomas");
    expect(shortLayerLabel("bienestar", "denuncias", getLayer("denuncias")!.label)).toBe(
      "Denuncias",
    );
    expect(shortLayerLabel("perdidas-reunificacion", "perdidas", getLayer("perdidas")!.label)).toBe(
      "Avistajes",
    );
    expect(
      shortLayerLabel("perdidas-reunificacion", "reunificacion", getLayer("reunificacion")!.label),
    ).toBe("Tasa por unidad");
  });

  it("falls back to canonical when no override exists / manual mode", () => {
    expect(shortKpiLabel(null, "perdidas", CANONICAL_KPI.perdidas)).toBe("Pérdidas activas");
    expect(shortKpiLabel("brotes-activos", "cobertura", CANONICAL_KPI.cobertura)).toBe(
      "Cobertura antirrábica (perros, 12m)",
    );
  });

  // The QA-requested snapshot: the 8 vistas' displayed KPI + layer label sets.
  it("snapshots the de-dup output across all 8 vistas", () => {
    const snapshot = PANORAMA_PRESETS.map((p) => ({
      vista: p.label,
      kpis: p.metrics.map((id) => shortKpiLabel(p.id, id, CANONICAL_KPI[id])),
      layers: presetLayerIds(p).map((id) => shortLayerLabel(p.id, id, getLayer(id)!.label)),
    }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "kpis": [
            "Cobertura antirrábica (perros, 12m)",
            "Zoonosis activas",
            "Mordeduras / 10k hab.",
          ],
          "layers": [
            "Cobertura antirrábica (perros, 12m)",
            "Zoonosis / señales",
          ],
          "vista": "Brotes activos",
        },
        {
          "kpis": [
            "Zoonosis activas",
            "Mordeduras / 10k hab.",
            "Denuncias activas",
          ],
          "layers": [
            "Síntomas",
            "Zoonosis / señales",
          ],
          "vista": "Síntomas / vigilancia sindrómica",
        },
        {
          "kpis": [
            "Cobertura antirrábica (perros, 12m)",
            "Cobertura de esterilización",
            "Microchip",
          ],
          "layers": [
            "Cobertura antirrábica (perros, 12m)",
          ],
          "vista": "Cumplimiento antirrábico",
        },
        {
          "kpis": [
            "Registro PPP",
            "Microchip",
          ],
          "layers": [
            "Registro PPP (C7)",
          ],
          "vista": "Registro PPP",
        },
        {
          "kpis": [
            "Denuncias activas",
            "Mordeduras / 10k hab.",
          ],
          "layers": [
            "Denuncias",
            "Decomisos",
          ],
          "vista": "Bienestar y fiscalización",
        },
        {
          "kpis": [
            "Cobertura de esterilización",
            "Pérdidas activas",
          ],
          "layers": [
            "Cobertura de esterilización",
          ],
          "vista": "Control poblacional",
        },
        {
          "kpis": [
            "Mortalidad registrada",
            "Cobertura de esterilización",
          ],
          "layers": [
            "Mortalidad / disposición",
          ],
          "vista": "Mortalidad",
        },
        {
          "kpis": [
            "Activas",
            "Tasa de reunificación",
            "Denuncias activas",
          ],
          "layers": [
            "Avistajes",
            "Tasa por unidad",
          ],
          "vista": "Pérdidas y reunificación",
        },
        {
          "kpis": [
            "Cobertura antirrábica (perros, 12m)",
            "Cobertura de esterilización",
          ],
          "layers": [
            "Desierto veterinario (días sin actividad)",
          ],
          "vista": "Desierto veterinario",
        },
        {
          "kpis": [
            "Mordeduras / 10k hab.",
            "Pérdidas activas",
            "Denuncias activas",
          ],
          "layers": [
            "Tendencia de eventos (Δ vs período anterior)",
          ],
          "vista": "Tendencia",
        },
        {
          "kpis": [
            "Mordeduras / 10k hab.",
            "Registro PPP",
            "Microchip",
          ],
          "layers": [
            "Registro PPP (C7)",
            "Mordeduras / antirrábica",
          ],
          "vista": "Riesgo PPP",
        },
      ]
    `);
  });
});

describe("countFiltroModifiers", () => {
  it("counts 0 for a vista at its defaults (base only, default period, no toggles)", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura"],
        presetId: "cumplimiento",
        baseLayerId: "cobertura",
        activePeriod: "90d",
        verifiedOnly: false,
      }),
    ).toBe(0);
  });

  it("counts active overlay layers (signal + reference), never the base", () => {
    // cumplimiento default base (cobertura) + a zoonosis signal overlay.
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura", "zoonosis"],
        presetId: "cumplimiento",
        baseLayerId: "cobertura",
        activePeriod: "90d",
        verifiedOnly: false,
      }),
    ).toBe(1);
  });

  it("counts a non-default period as one deviation", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura"],
        presetId: "cumplimiento",
        baseLayerId: "cobertura",
        activePeriod: "30d", // cumplimiento default is 90d
        verifiedOnly: false,
      }),
    ).toBe(1);
  });

  it("counts a re-based base layer as one deviation", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["esterilizacion"],
        presetId: "cumplimiento", // default base is cobertura
        baseLayerId: "esterilizacion",
        activePeriod: "90d",
        verifiedOnly: false,
      }),
    ).toBe(1);
  });

  it("counts verifiedOnly as one deviation", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura"],
        presetId: "cumplimiento",
        baseLayerId: "cobertura",
        activePeriod: "90d",
        verifiedOnly: true,
      }),
    ).toBe(1);
  });

  it("sums overlays + all deviations", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura", "zoonosis"], // +1 overlay
        presetId: "cumplimiento",
        baseLayerId: "cobertura",
        activePeriod: "30d", // +1 period
        verifiedOnly: true, // +1 verified
      }),
    ).toBe(3);
  });

  it("in manual mode uses the app default period as the baseline", () => {
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura"],
        presetId: null,
        baseLayerId: "cobertura",
        activePeriod: PANORAMA_DEFAULT_PRESET,
        verifiedOnly: false,
      }),
    ).toBe(0);
    expect(
      countFiltroModifiers({
        activeLayerIds: ["cobertura"],
        presetId: null,
        baseLayerId: "cobertura",
        activePeriod: PANORAMA_DEFAULT_PRESET === "3y" ? "30d" : "3y",
        verifiedOnly: false,
      }),
    ).toBe(1);
  });
});

describe("describeCapasMeta / filtroBadgeAriaLabel — the badge stops masquerading as a layer count (Item 3)", () => {
  it("names BOTH facts: real active layers AND modifiers over the vista", () => {
    expect(describeCapasMeta({ activeLayerCount: 2, modifierCount: 1 })).toBe(
      "2 capas activas · 1 ajuste sobre la vista",
    );
  });

  it("pluralizes each fact independently", () => {
    expect(describeCapasMeta({ activeLayerCount: 1, modifierCount: 3 })).toBe(
      "1 capa activa · 3 ajustes sobre la vista",
    );
    expect(describeCapasMeta({ activeLayerCount: 0, modifierCount: 0 })).toBe(
      "0 capas activas · 0 ajustes sobre la vista",
    );
  });

  it("badge aria-label names what the number counts (not a bare integer)", () => {
    expect(filtroBadgeAriaLabel(1)).toBe("1 ajuste sobre la vista");
    expect(filtroBadgeAriaLabel(3)).toBe("3 ajustes sobre la vista");
  });
});

describe("legendRampTitle — the collapsed legend pill names the layer that PAINTED the ramp", () => {
  it("A2 regression: a DRILLED division count ramp is titled by the base choropleth, not the signal overlay", () => {
    // Custom vista, zoonosis + cobertura active, drilled to departments.
    // captionLayer = the first active non-reference layer = "Zoonosis / señales"
    // (it precedes cobertura in the catalogue), but the ramp is cobertura's
    // department COUNT fill. The title must follow the ramp, demoted to counts.
    expect(
      legendRampTitle({
        bivariateActive: false,
        captionLabel: "Zoonosis / señales",
        captionPaintsProvinceRamp: false,
        divisionRampLabel: "Cobertura antirrábica (perros, 12m)",
      }),
    ).toBe("Cobertura antirrábica (perros, 12m) (conteo)");
  });

  it("titles by the caption layer when IT paints its own province-grain ramp", () => {
    // At province grain cobertura paints its own classed % ramp — the caption
    // layer IS the paint, so it keeps its (rate) label with no count demotion.
    expect(
      legendRampTitle({
        bivariateActive: false,
        captionLabel: "Cobertura antirrábica (perros, 12m)",
        captionPaintsProvinceRamp: true,
        divisionRampLabel: null,
      }),
    ).toBe("Cobertura antirrábica (perros, 12m)");
  });

  it("bivariate matrix overrides both", () => {
    expect(
      legendRampTitle({
        bivariateActive: true,
        captionLabel: "Cobertura antirrábica (perros, 12m)",
        captionPaintsProvinceRamp: true,
        divisionRampLabel: "Cobertura antirrábica (perros, 12m)",
      }),
    ).toBe("Riesgo combinado");
  });

  it("no ramp at all → falls back to the caption label (names the point overlay's dots)", () => {
    expect(
      legendRampTitle({
        bivariateActive: false,
        captionLabel: "Zoonosis / señales",
        captionPaintsProvinceRamp: false,
        divisionRampLabel: null,
      }),
    ).toBe("Zoonosis / señales");
  });

  it("no ramp and no caption → the generic graduated fallback", () => {
    expect(
      legendRampTitle({
        bivariateActive: false,
        captionLabel: null,
        captionPaintsProvinceRamp: false,
        divisionRampLabel: null,
      }),
    ).toBe("Eventos por unidad");
  });
});
