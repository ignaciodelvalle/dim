// @vitest-environment jsdom
//
// PanoramaMetricsColumn — panorama-vista-redesign Phase 3.
//
// Verifies the per-vista metrics column renders exactly the preset's curated
// `metrics` (in order), reading the SAME getPanoramaKpis() result (no forked
// query), and falls back to showing every KPI when no preset is active
// (manual/advanced mode).

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanoramaMetricsColumn } from "@/components/panorama/PanoramaMetricsColumn";
import type {
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { getPreset } from "@/src/modules/panorama/domain/presets";

afterEach(cleanup);

function kpi(id: PanoramaKpi["id"], label: string): PanoramaKpi {
  return {
    id,
    label,
    value: "10%",
    tone: "neutral",
    info: { definition: "def" },
    href: "/gob/x",
    source: "test",
  };
}

const ALL_KPIS: PanoramaKpis = {
  kpis: [
    kpi("cobertura", "Cobertura antirrábica"),
    kpi("esterilizacion", "Cobertura de esterilización"),
    kpi("perdidas", "Pérdidas activas"),
    kpi("mordeduras", "Mordeduras / 10k hab."),
    kpi("zoonosis", "Zoonosis activas"),
    kpi("denuncias", "Denuncias activas"),
    kpi("mascotas", "Mascotas en cobertura"),
  ],
  recalculatedFor: "Recalculado para el alcance nacional.",
  dataAsOf: null,
};

describe("PanoramaMetricsColumn — switching vista updates the column", () => {
  it("shows bienestar's metrics (denuncias, mordeduras, mascotas) in order", () => {
    const bienestar = getPreset("bienestar")!;
    render(<PanoramaMetricsColumn kpis={ALL_KPIS} metricIds={bienestar.metrics} />);

    const labels = screen
      .getAllByText(/Denuncias activas|Mordeduras|Mascotas en cobertura/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Denuncias activas", "Mordeduras / 10k hab.", "Mascotas en cobertura"]);
    expect(screen.queryByText("Cobertura antirrábica")).not.toBeInTheDocument();
  });

  it("switching to control-poblacional shows esterilizacion/mascotas/perdidas instead", () => {
    const controlPoblacional = getPreset("control-poblacional")!;
    const { rerender } = render(
      <PanoramaMetricsColumn kpis={ALL_KPIS} metricIds={getPreset("bienestar")!.metrics} />,
    );
    expect(screen.getByText("Denuncias activas")).toBeInTheDocument();

    rerender(<PanoramaMetricsColumn kpis={ALL_KPIS} metricIds={controlPoblacional.metrics} />);

    expect(screen.getByText("Cobertura de esterilización")).toBeInTheDocument();
    expect(screen.getByText("Mascotas en cobertura")).toBeInTheDocument();
    expect(screen.getByText("Pérdidas activas")).toBeInTheDocument();
    expect(screen.queryByText("Denuncias activas")).not.toBeInTheDocument();
  });

  it("manual/advanced mode (metricIds null) shows every KPI — nothing hidden", () => {
    render(<PanoramaMetricsColumn kpis={ALL_KPIS} metricIds={null} />);

    for (const k of ALL_KPIS.kpis) {
      expect(screen.getByText(k.label)).toBeInTheDocument();
    }
  });

  it("QA fix (finding 6): a partial payload that filters out every curated metric shows an honest empty state, not nothing", () => {
    const partialPayload: PanoramaKpis = {
      kpis: [kpi("cobertura", "Cobertura antirrábica")], // none of bienestar's metrics
      recalculatedFor: ALL_KPIS.recalculatedFor,
      dataAsOf: null,
    };
    const bienestar = getPreset("bienestar")!;
    const { container } = render(
      <PanoramaMetricsColumn kpis={partialPayload} metricIds={bienestar.metrics} />,
    );

    expect(screen.getByText("Métricas no disponibles para esta vista.")).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });
});
