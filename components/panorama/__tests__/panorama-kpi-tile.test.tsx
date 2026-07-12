// PanoramaKpiTile — v+1 rail additions (sparkline + target-progress bar).
//
// Pattern: renderToStaticMarkup (repo convention for OpKpi-prop contracts —
// see __tests__/dashboards-vnext-fase0.test.tsx). No jsdom required; verifies
// the tile forwards `kpi.sparkline`/`kpi.bar` to OpKpi without throwing and
// that the existing neutral-delta contract (never a valence color) survives.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanoramaKpiTile } from "@/components/panorama/PanoramaKpiTile";
import type { PanoramaKpi } from "@/src/modules/panorama/application/get-panorama-kpis";

const REUNIFICACION_KPI: PanoramaKpi = {
  id: "reunificacion",
  label: "Tasa de reunificación",
  value: "45,2%",
  sub: "meta 39% · 19 de 42 episodios",
  bar: 45.2,
  tone: "ok",
  href: "/gob/perdidas",
  source: "compliance-metrics.fetchReunificationRate",
  info: { definition: "def" },
};

const COBERTURA_KPI: PanoramaKpi = {
  id: "cobertura",
  label: "Cobertura antirrábica (perros, 12m)",
  value: "72,4%",
  bar: 72.4,
  tone: "warn",
  href: "/gob/analytics",
  source: "govt-home-kpis.fetchRabiesCoverage",
  info: { definition: "def" },
  sparkline: [60, 65, 68, 70, 72],
  delta: { pct: 12, unit: "pct", direction: "up", label: "+12% vs período anterior" },
};

describe("PanoramaKpiTile — v+1 rail (meta-progress meters + sparklines)", () => {
  it("renders without throwing when `bar` (target-progress meter) is set", () => {
    expect(() => renderToStaticMarkup(<PanoramaKpiTile kpi={REUNIFICACION_KPI} />)).not.toThrow();
  });

  it("renders the meta-progress bar fill via OpKpi's `bar` prop", () => {
    const html = renderToStaticMarkup(<PanoramaKpiTile kpi={REUNIFICACION_KPI} />);
    // OpKpi renders the bar as an inline width style clamped 0..100.
    expect(html).toContain("width:45.2%");
  });

  it("renders without throwing when `sparkline` is set (dynamic-imported chart)", () => {
    expect(() => renderToStaticMarkup(<PanoramaKpiTile kpi={COBERTURA_KPI} />)).not.toThrow();
  });

  it("keeps the delta line a NEUTRAL glyph — never a valence color (code review 2026-07-03)", () => {
    const html = renderToStaticMarkup(<PanoramaKpiTile kpi={COBERTURA_KPI} />);
    expect(html).toContain("▲");
    expect(html).toContain("+12% vs período anterior");
    // The neutral delta line must not carry the ok/err color tokens (those are
    // reserved for the v1/v2 OpKpi delta props, unused by PanoramaKpiTile).
    expect(html).not.toContain("var(--color-st-ok)");
    expect(html).not.toContain("var(--color-st-err)");
  });

  it("still renders label and value alongside the new props", () => {
    const html = renderToStaticMarkup(<PanoramaKpiTile kpi={REUNIFICACION_KPI} />);
    expect(html).toContain("Tasa de reunificación");
    expect(html).toContain("45,2%");
  });
});
