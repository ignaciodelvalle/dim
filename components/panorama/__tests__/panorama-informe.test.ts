// task #55 — pure builder tests for the "Informe de situación" model.
//
// Every assertion here guards an HONESTY or PARITY property of a govt
// decision-justification artifact: the "situación al" corte label never fakes a
// date at the live edge; the ranking heading + value/gap formatting mirror the
// on-screen RankedUnitsPanel; the k-anon disclosure + suppressed count are always
// present; and a degraded KPI fan-out REPLACES the numbers with an honest failure
// instead of reading as an all-clear.

import { describe, expect, it } from "vitest";

import {
  type BuildInformeInput,
  type InformeKpiInput,
  buildInformeModel,
  informeAsOfLabel,
} from "@/components/panorama/panorama-informe";
import { partitionKpiIdsByRelevance } from "@/src/modules/panorama/domain/metric-relevance";
import type { PanoramaKpiId } from "@/src/modules/panorama/domain/types";

/** The informe KPI inputs carry `id: string`; the relevance gate keys on the
 *  PanoramaKpiId union. In the console the ids ARE PanoramaKpiIds (they come from
 *  the KPI payload); the test narrows the fixture ids the same way. */
function asRelevanceInput(
  kpis: readonly InformeKpiInput[],
): Array<InformeKpiInput & { id: PanoramaKpiId }> {
  return kpis as Array<InformeKpiInput & { id: PanoramaKpiId }>;
}

function baseInput(overrides: Partial<BuildInformeInput> = {}): BuildInformeInput {
  return {
    scopeLabel: "Nacional",
    periodLabel: "últimos 90 días",
    asOf: null,
    generatedAt: null,
    isDemo: false,
    viewSummary: "Vista personalizada — Argentina (todas las provincias), últimos 90 días.",
    kpis: [
      {
        id: "cobertura",
        label: "Cobertura antirrábica",
        value: "64%",
        sub: "meta 80%",
        currentState: true,
        delta: { label: "+3 pts vs período anterior" },
        info: {
          definition:
            "Porcentaje de perros del padrón con vacunación antirrábica. Segundo detalle irrelevante.",
        },
      },
      {
        id: "mordeduras",
        label: "Mordeduras / 10k hab.",
        value: "1,2",
        delta: { label: "+12% vs período anterior" },
        info: { definition: "Tasa de incidentes de mordedura por cada 10.000 habitantes." },
      },
    ],
    kpisDegraded: false,
    ranking: {
      rows: [
        { key: "AR-D", label: "San Luis", value: 41, gap: 39 },
        { key: "AR-G", label: "Tucumán", value: 55, gap: 25 },
      ],
      kind: "rate",
      measureLabel: "cobertura antirrábica",
      smallScope: false,
      unitNoun: "jurisdicciones",
      suppressedCount: 2,
      unavailable: false,
    },
    caption:
      "Cada área es una provincia. Relleno = cobertura antirrábica, estado actual. Meta 80%.",
    activeLayerLabels: ["Cobertura antirrábica", "Señales de zoonosis"],
    suppressedTotal: 3,
    ...overrides,
  };
}

describe("informeAsOfLabel", () => {
  it("names the corte date when a scrub is active (T2.4: shared long UTC day shape)", () => {
    expect(informeAsOfLabel(new Date("2026-07-04T12:00:00Z"))).toBe(
      "Situación al 4 de julio de 2026",
    );
  });

  it("never fakes a date at the live edge", () => {
    expect(informeAsOfLabel(null)).toBe("Datos en vivo (sin corte temporal)");
  });
});

describe("buildInformeModel", () => {
  it("titles the informe with the scope and threads the header labels", () => {
    const m = buildInformeModel(baseInput({ scopeLabel: "Córdoba" }));
    expect(m.title).toBe("Informe de situación · Córdoba");
    expect(m.periodLabel).toBe("últimos 90 días");
    expect(m.asOfLabel).toBe("Datos en vivo (sin corte temporal)");
    expect(m.generatedAtLabel).toBeNull();
  });

  it("stamps the generation time only when provided", () => {
    const m = buildInformeModel(baseInput({ generatedAt: new Date("2026-07-12T14:30:00") }));
    expect(m.generatedAtLabel).toContain("2026");
  });

  it("tags stock KPIs as 'estado actual' and passes deltas through", () => {
    const m = buildInformeModel(baseInput());
    const cobertura = m.kpis.find((k) => k.id === "cobertura");
    const mordeduras = m.kpis.find((k) => k.id === "mordeduras");
    expect(cobertura?.stateTag).toBe("estado actual");
    expect(cobertura?.deltaLabel).toBe("+3 pts vs período anterior");
    expect(mordeduras?.stateTag).toBeUndefined();
  });

  it("builds the 'Peores N · métrica' heading and formats rate value + gap", () => {
    const m = buildInformeModel(baseInput());
    expect(m.ranking?.heading).toBe("Peores 2 · cobertura antirrábica");
    expect(m.ranking?.columnLabel).toBe("cobertura antirrábica · pts vs objetivo");
    expect(m.ranking?.rows[0]).toMatchObject({
      rank: 1,
      label: "San Luis",
      value: "41%",
      gapText: "−39 pts vs objetivo",
    });
  });

  it("reframes the heading for a small scope", () => {
    const m = buildInformeModel(
      baseInput({
        ranking: {
          rows: [{ key: "AR-C-1", label: "Comuna 1", value: 12, gap: null }],
          kind: "density",
          measureLabel: "señales de zoonosis",
          smallScope: true,
          unitNoun: "comunas",
          suppressedCount: 0,
          unavailable: false,
        },
      }),
    );
    expect(m.ranking?.heading).toBe("Tus 1 comunas · señales de zoonosis");
    expect(m.ranking?.rows[0].value).toBe("12");
    expect(m.ranking?.rows[0].gapText).toBeUndefined();
    expect(m.ranking?.suppressedNote).toBeUndefined();
  });

  it("always discloses the k-anon treatment and the scoped suppressed count", () => {
    const m = buildInformeModel(baseInput());
    expect(m.kAnonDisclosure).toContain("k-anonimato");
    expect(m.kAnonDisclosure).toContain("3 celdas ocultas");
    expect(m.ranking?.suppressedNote).toBe("2 unidades protegidas por privacidad (k-anonimato).");
  });

  it("keeps the k-anon base sentence even with zero suppression", () => {
    const m = buildInformeModel(baseInput({ suppressedTotal: 0 }));
    expect(m.kAnonDisclosure).toContain("k-anonimato");
    expect(m.kAnonDisclosure).not.toContain("celdas ocultas");
  });

  it("extracts the first-sentence method note per KPI (dashboard-parity wording)", () => {
    const m = buildInformeModel(baseInput());
    expect(m.methodNotes).toContain("Porcentaje de perros del padrón con vacunación antirrábica.");
    expect(m.methodNotes).toContain("Tasa de incidentes de mordedura por cada 10.000 habitantes.");
  });

  it("carries the demo banner copy so it is never dropped", () => {
    const m = buildInformeModel(baseInput({ isDemo: true }));
    expect(m.isDemo).toBe(true);
    expect(m.demoText).toContain("Datos de demostración");
    expect(m.demoText).toContain("sintético");
  });

  it("REPLACES the KPIs with an honest failure when the fan-out degraded", () => {
    const m = buildInformeModel(baseInput({ kpisDegraded: true }));
    expect(m.kpis).toHaveLength(0);
    expect(m.kpisDegradedText).toContain("No pudimos calcular");
  });

  it("shows an honest empty ranking instead of an all-clear when data is unavailable", () => {
    const m = buildInformeModel(
      baseInput({
        ranking: {
          rows: [],
          kind: "rate",
          measureLabel: "cobertura antirrábica",
          smallScope: false,
          unitNoun: "jurisdicciones",
          suppressedCount: 0,
          unavailable: true,
        },
      }),
    );
    expect(m.ranking?.emptyText).toBe("No pudimos calcular el ranking en este momento.");
  });
});

// Review finding 5 — the manual-mode relevance gate that the console applies to
// the Informe's KPI input (partitionKpiIdsByRelevance → relevant). This mirrors
// the exact composition PanoramaConsole.readingKpis performs before handing the
// list to buildInformeModel, so the printable report never headlines a metric
// whose subject layer is NOT on the map (the same "projection lie" C2a fixed for
// the KPI chips). Preset mode is immune (the curated metricIds are not re-filtered)
// and is exercised by not calling the partition.
describe("Informe manual-mode relevance gating (finding 5)", () => {
  it("drops a KPI whose subject layer is not active from the informe kpis + method notes", () => {
    // Manual mode with ONLY the mordeduras layer painted: the cobertura KPI does
    // not describe the map and must not reach the printable report.
    const { relevant } = partitionKpiIdsByRelevance(asRelevanceInput(baseInput().kpis), [
      "mordeduras",
    ]);
    const m = buildInformeModel(baseInput({ kpis: relevant }));

    const ids = m.kpis.map((k) => k.id);
    expect(ids).toContain("mordeduras");
    expect(ids).not.toContain("cobertura");
    // The method footnotes derive from the SAME shown KPIs — the cobertura note
    // must also be gone (no orphaned methodology for a hidden metric).
    expect(m.methodNotes.join(" ")).not.toContain("vacunación antirrábica");
    expect(m.methodNotes.join(" ")).toContain("mordedura");
  });

  it("keeps every KPI when both subject layers are active (nothing to gate)", () => {
    const { relevant } = partitionKpiIdsByRelevance(asRelevanceInput(baseInput().kpis), [
      "cobertura",
      "mordeduras",
    ]);
    const m = buildInformeModel(baseInput({ kpis: relevant }));
    expect(m.kpis.map((k) => k.id)).toEqual(["cobertura", "mordeduras"]);
  });
});
