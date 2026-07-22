// @vitest-environment jsdom
//
// Hostile-reader suite — the C1 acceptance test (docs/reviews/results/
// 2026-07-22-plan-maestro-integridad.md, §2 "C1 · Contrato de Métrica", test
// de aceptación). The red-team review's "narrativas opuestas" table becomes
// assertions here: for each metric this task touched, the tile the operator
// actually sees must carry whatever information disarms the WRONG reading —
// never just the bare number + color.
//
// RENDER-LEVEL: this tests the guard engine (lib/metrics/presentation-
// guards.ts) directly for the pure invariants, and the OpKpi `descriptorId`
// path (components/ui/dashboard/OpKpi.tsx) via @testing-library/react for
// what the operator's screen actually shows — same posture as OpKpi.test.tsx.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OpKpi } from "@/components/ui/dashboard/OpKpi";
import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";
import {
  UNSTABLE_DELTA_BASE_NOTE,
  resolveSemaphoreTone,
  shouldSuppressDelta,
  zeroDenominatorGate,
} from "@/lib/metrics/presentation-guards";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// 1. Reunificación 100% con N=2 — "100% reunificación junto a 68 perdidas"
// ---------------------------------------------------------------------------

describe("hostile reader — reunificación con N chico (red-team: '100% con N=2')", () => {
  it("renders neutral tone (never 'ok' green) and carries the '2 de' episode count", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.reunification_rate.label}
        value="100,0%"
        tone="ok"
        sub="meta 39% · 2 de 2 episodios (30d) · 68 perdidas activas ahora"
        descriptorId="reunification_rate"
        guardInput={{ n: 2 }}
      />,
    );

    // The real value survives — this is an honest fact, not hidden.
    expect(screen.getByText("100,0%")).toBeInTheDocument();
    // The episode count that disarms "100% = total success" is visible.
    expect(screen.getByText(/2 de 2 episodios/)).toBeInTheDocument();
    // The small-sample note the guard engine appends is visible.
    expect(screen.getByText(/Muestra chica/)).toBeInTheDocument();
    // Tone was forced neutral: the card must NOT carry the "ok" (green)
    // surface token — a 100% figure over N=2 must not read as a green win.
    const card = screen.getByText("100,0%").closest("div.flex.flex-col");
    expect(card?.className).not.toContain("st-ok-bg");
    expect(card?.className).toContain("bg-ln-op-card");
  });

  it("guard engine: zero episodes hits the zero-denominator gate, not the small-N gate", () => {
    expect(zeroDenominatorGate(KPI_CATALOG.reunification_rate, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Mortalidad 0/0 → "—" — "0 observaciones leído como 'controlado'" class
// ---------------------------------------------------------------------------

describe("hostile reader — mortalidad 0/0 (latent '0/0 → 0%')", () => {
  it("the descriptor declares the zero-denominator dash guard", () => {
    expect(KPI_CATALOG.mortality_deaths_12m.guards?.zeroDenominator).toBe("dash");
  });

  it("zero deaths gates traceableRate to a dash, not a fabricated 0%", () => {
    expect(zeroDenominatorGate(KPI_CATALOG.mortality_deaths_12m, 0)).toBe(true);
    expect(zeroDenominatorGate(KPI_CATALOG.mortality_deaths_12m, 12)).toBe(false);
  });

  it("OpKpi renders the dash (never '0%') when n=0 under this descriptor", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.mortality_disposal_traceability.label}
        value="0,0%"
        tone="danger"
        descriptorId="mortality_disposal_traceability"
        guardInput={{ n: 0 }}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0,0%")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Antirrábica histórica — "doble antirrábica" (S1's headline example)
// ---------------------------------------------------------------------------

describe("hostile reader — antirrábica histórica nunca se confunde con cumplimiento", () => {
  it("the historic all-species KPI's label is unmistakably NOT a compliance figure", () => {
    const label = KPI_CATALOG.rabies_vaccination_rate_all_species.label.toLowerCase();
    expect(label).toContain("histórica");
    // And it must NOT share the compliance KPI's "cobertura antirrábica" stem
    // that caused the original 42%/54% same-label collision.
    expect(label).not.toContain("cobertura antirrábica");
  });

  it("never paints a tone derived from the 80% compliance target, at any rate value", () => {
    const descriptor = KPI_CATALOG.rabies_vaccination_rate_all_species;
    expect(descriptor.semaphore?.paintAgainst).toBe("none");
    // Whatever tone a render site might (wrongly) compute against the 80%
    // target, the guard degrades it to the informational "blue" — for a
    // rate far below AND far above the target alike.
    for (const computed of ["danger", "warn", "ok"] as const) {
      expect(resolveSemaphoreTone(descriptor, computed)).toBe("blue");
    }
  });

  it("the two rabies KPIs remain distinctly labeled (regression: the original bug)", () => {
    expect(KPI_CATALOG.rabies_coverage_dogs_12m.label).not.toBe(
      KPI_CATALOG.rabies_vaccination_rate_all_species.label,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. PPP — red-team #7, self-serve uptake painted "Peligro"
// ---------------------------------------------------------------------------

describe("hostile reader — PPP nunca pinta 'Peligro' desde una tasa de adopción", () => {
  it("the descriptor is contractually semaphore: none", () => {
    expect(KPI_CATALOG.ppp_registry_compliance.semaphore?.paintAgainst).toBe("none");
  });

  it("resolveSemaphoreTone never returns 'danger', even for a computed 0% rate", () => {
    const descriptor = KPI_CATALOG.ppp_registry_compliance;
    expect(resolveSemaphoreTone(descriptor, "danger")).not.toBe("danger");
  });

  it("OpKpi never renders the danger (red 'Peligro') surface for this descriptor", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.ppp_registry_compliance.label}
        value="0,0%"
        tone={resolveSemaphoreTone(KPI_CATALOG.ppp_registry_compliance, "danger")}
        sub="0 de 3 atestadas en MiMAR · no mide cumplimiento registral externo · Ley 4078"
        descriptorId="ppp_registry_compliance"
      />,
    );
    // "Peligro" is the sr-only tone label OpKpi emits for the danger tone —
    // it must never appear for this KPI.
    expect(screen.queryByText("Peligro:")).not.toBeInTheDocument();
    const card = screen.getByText("0,0%").closest("div.flex.flex-col");
    expect(card?.className).not.toContain("st-err-bg");
  });

  it("label/sub distinguish MiMAR self-attestation from external registry compliance", () => {
    const label = KPI_CATALOG.ppp_registry_compliance.label;
    expect(label.toLowerCase()).toContain("mimar");
    expect(KPI_CATALOG.ppp_registry_compliance.exclusions ?? "").toMatch(/registral externo/);
  });
});

// ---------------------------------------------------------------------------
// 5. Esterilizaciones −95% MoM sobre base inestable
// ---------------------------------------------------------------------------

describe("hostile reader — esterilizaciones: delta ausente sobre base inestable", () => {
  it("the guard suppresses the delta below the descriptor's prior-base floor", () => {
    expect(shouldSuppressDelta(KPI_CATALOG.sterilizations_per_month, 1)).toBe(true);
    expect(shouldSuppressDelta(KPI_CATALOG.sterilizations_per_month, 20)).toBe(false);
  });

  it("OpKpi omits the deltaV2 chip and shows the honest note when the prior base is unstable", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.sterilizations_per_month.label}
        value="1"
        deltaV2={{ value: -95, period: "vs mes ant." }}
        descriptorId="sterilizations_per_month"
        guardInput={{ priorBase: 1 }}
      />,
    );
    expect(screen.queryByText(/-95/)).not.toBeInTheDocument();
    expect(screen.getByText(UNSTABLE_DELTA_BASE_NOTE)).toBeInTheDocument();
  });

  it("a healthy prior base still renders the delta chip", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.sterilizations_per_month.label}
        value="40"
        deltaV2={{ value: 12, period: "vs mes ant." }}
        descriptorId="sterilizations_per_month"
        guardInput={{ priorBase: 30 }}
      />,
    );
    expect(screen.getByText(/vs mes ant\./)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Bite escalation gap — red-team #6, empty queue ≠ "controlado"
// ---------------------------------------------------------------------------

describe("hostile reader — brecha de escalamiento nunca colapsa en una sola cifra", () => {
  it("the descriptor is a pair, not a ratio — no target, no semaphore judgment", () => {
    const descriptor = KPI_CATALOG.bite_escalation_gap;
    expect(descriptor.target).toBeUndefined();
    expect(descriptor.semaphore?.paintAgainst).toBe("none");
  });

  it("OpKpi renders BOTH counts, never a single blended ratio", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.bite_escalation_gap.label}
        value="690"
        sub="vs 0 observaciones rábicas abiertas — los reportes sin escalamiento no implican ausencia de riesgo"
        descriptorId="bite_escalation_gap"
      />,
    );
    expect(screen.getByText("690")).toBeInTheDocument();
    expect(screen.getByText(/0 observaciones rábicas abiertas/)).toBeInTheDocument();
    expect(screen.getByText(/no implican ausencia de riesgo/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Microchip — red-team #15, denominator wording ("activas" vs active+lost)
// ---------------------------------------------------------------------------

describe("hostile reader — microchip: el denominador declarado coincide con el real", () => {
  it("the catalog denominator prose names BOTH active and lost pets, not 'activas' alone", () => {
    const denom = KPI_CATALOG.microchip_penetration.denominator.toLowerCase();
    expect(denom).toContain("active/lost");
  });

  it("the /gob home sub text names both populations (regression: 'de N activas' undercounted the denominator)", () => {
    render(
      <OpKpi
        label={KPI_CATALOG.microchip_penetration.label}
        value="64,3%"
        sub="meta 80% · 320 de 500 activas/perdidas · Ley 14.107"
        descriptorId="microchip_penetration"
      />,
    );
    expect(screen.getByText(/activas\/perdidas/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. Antirrábica — denominador dual donde el censo aplica (red-team #2, parcial)
// ---------------------------------------------------------------------------

describe("hostile reader — cobertura antirrábica: censo co-equal, no subtexto", () => {
  it("the confidence contract names the census estimate as an input, not an afterthought", () => {
    const inputs = KPI_CATALOG.rabies_coverage_dogs_12m.confidence?.inputs ?? [];
    expect(inputs.some((i) => i.toLowerCase().includes("censal"))).toBe(true);
  });

  it("the home tile's sub renders the census figure as its OWN bolded first line, not a trailing clause", () => {
    render(
      <OpKpi
        label="Cobertura antirrábica (perros, 12m)"
        value="41,3%"
        sub={
          <span className="block space-y-0.5">
            <span className="block font-semibold text-ln-op-ink">
              68,2% del padrón sobre la población canina estimada
            </span>
            <span className="block text-ln-op-mute">12.480 perros en el padrón · meta 80%</span>
          </span>
        }
        descriptorId="rabies_coverage_dogs_12m"
      />,
    );
    // Both denominators are independently visible — neither is buried inside
    // a single run-on sentence with the other.
    expect(
      screen.getByText(/68,2% del padrón sobre la población canina estimada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/12\.480 perros en el padrón/)).toBeInTheDocument();
  });
});
