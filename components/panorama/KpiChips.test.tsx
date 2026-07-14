// @vitest-environment jsdom
//
// KpiChips — READ-ONLY contract (#53 Option A, PO 2026-07-14). The chips are
// INDICATORS, never controls: reading a number and changing the map are
// different acts, and the old click-to-rebase (a chip that looked like a stat
// but silently swapped the choropleth base) was the panorama's most confusing
// interaction. These tests pin the new contract: NO radiogroup, NO buttons, NO
// rebase — plus the honesty states (pending/degraded/empty, "estado actual")
// that survive unchanged from the interactive era.

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { KpiChips } from "./KpiChips";

/** Minimal PanoramaKpi fixture — only the fields KpiChips reads matter. */
function kpi(
  id: string,
  label: string,
  value: string,
  extra: Partial<PanoramaKpi> = {},
): PanoramaKpi {
  return {
    id: id as PanoramaKpi["id"],
    label,
    value,
    tone: "neutral",
    info: { definition: `Definición de ${label}. Segunda oración.` },
    href: "/gob/mock",
    source: "mock",
    ...extra,
  };
}

// The same interleaved mix the old radio contract used (base-role and
// signal-role KPIs) — under #53 Option A they are ALL equal read-only cards.
const KPIS: PanoramaKpis = {
  kpis: [
    kpi("cobertura", "Cobertura antirrábica", "64%"),
    kpi("zoonosis", "Señales de zoonosis", "3"),
    kpi("esterilizacion", "Cobertura de esterilización", "38%"),
    kpi("reunificacion", "Reunificación", "71%"),
  ],
  recalculatedFor: "Argentina · 90 días",
  dataAsOf: null,
};

afterEach(cleanup);

describe("KpiChips — read-only contract (#53 Option A)", () => {
  it("renders every KPI value with NO radio semantics and NO buttons", () => {
    render(<KpiChips kpis={KPIS} metricIds={null} presetId={null} />);
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
    // Reading is not steering: nothing here is interactive.
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is an accessible LIST of indicators (es-AR label)", () => {
    render(<KpiChips kpis={KPIS} metricIds={null} presetId={null} />);
    const list = screen.getByRole("list", { name: "Indicadores de esta vista" });
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll("li")).toHaveLength(4);
  });

  it("the hover title carries the method note and promises NO map action", () => {
    render(<KpiChips kpis={KPIS} metricIds={null} presetId={null} />);
    const card = screen.getByText("64%").closest("li");
    expect(card).toHaveAttribute(
      "title",
      "Cobertura antirrábica — Definición de Cobertura antirrábica.",
    );
    // The old affordance copy ("Click para pintar el mapa…") must be gone.
    expect(card?.getAttribute("title")).not.toMatch(/[Cc]lick/);
  });

  it("caps the cluster at 4 cards (the map dominates)", () => {
    const many: PanoramaKpis = {
      ...KPIS,
      kpis: [
        ...KPIS.kpis,
        kpi("mordeduras", "Mordeduras", "12"),
        kpi("denuncias", "Denuncias", "7"),
      ],
    };
    render(<KpiChips kpis={many} metricIds={null} presetId={null} />);
    expect(screen.getByRole("list").querySelectorAll("li")).toHaveLength(4);
  });
});

describe("KpiChips — honesty states (unchanged from the interactive era)", () => {
  it("degraded state renders the honest failure copy", () => {
    render(<KpiChips kpis={KPIS} metricIds={null} presetId={null} degraded />);
    expect(
      screen.getByText("No pudimos cargar los indicadores en este momento."),
    ).toBeInTheDocument();
  });

  it("pending state renders the loading copy with aria-busy", () => {
    render(<KpiChips kpis={KPIS} metricIds={null} presetId={null} pending />);
    expect(screen.getByText("Cargando indicadores…")).toHaveAttribute("aria-busy", "true");
  });

  it("empty selection renders the no-metrics copy", () => {
    render(<KpiChips kpis={{ ...KPIS, kpis: [] }} metricIds={null} presetId={null} />);
    expect(screen.getByText("Métricas no disponibles para esta vista.")).toBeInTheDocument();
  });

  it("a STOCK KPI shows the emphasized 'estado actual' tag while a temporal frame is active", () => {
    const stock: PanoramaKpis = {
      ...KPIS,
      kpis: [kpi("cobertura", "Cobertura antirrábica", "64%", { currentState: true })],
    };
    const { rerender } = render(
      <KpiChips kpis={stock} metricIds={null} presetId={null} temporalFrameActive={false} />,
    );
    expect(screen.getByText("estado actual")).toBeInTheDocument();
    rerender(<KpiChips kpis={stock} metricIds={null} presetId={null} temporalFrameActive />);
    expect(screen.getByText("estado actual · no varía con la fecha")).toBeInTheDocument();
  });
});
