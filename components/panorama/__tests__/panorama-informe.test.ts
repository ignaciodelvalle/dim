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
  buildInformeModel,
  informeAsOfLabel,
} from "@/components/panorama/panorama-informe";

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
  it("names the corte date when a scrub is active", () => {
    expect(informeAsOfLabel(new Date("2026-07-04T12:00:00Z"))).toBe("Situación al 4 jul 2026");
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
