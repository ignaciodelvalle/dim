// @vitest-environment jsdom
//
// /admin/inteligencia streamed panels (platform-budget T3.2).
//
// The pre-T3 page raced ONE 10 s loadWithTimeout over four fetchers — one slow
// query degraded the WHOLE page, and "Reintentar" re-fought the same four-query
// contention. These tests pin the new contract: each panel awaits its OWN
// AnalyticsLoad envelope, degrades ALONE into the honest AnalyticsLoadFallback
// (with a retry href scoped to the page + current period params), and a
// degraded KPI tile says "sin datos" — never a fabricated zero.
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AnalyticsLoad } from "@/lib/analytics/analytics-load";
import type { ProvinceDataQualityResult } from "@/lib/analytics/territorial-data-quality";

import {
  IntelIndexKpis,
  IntelIndexPanel,
  IntelPolicyKpi,
  IntelPolicyPanel,
  IntelQualityPanel,
} from "./inteligencia-panels";

const ok = <T,>(value: T): Promise<AnalyticsLoad<T>> => Promise.resolve({ ok: true, value });
const timedOut = <T,>(): Promise<AnalyticsLoad<T>> =>
  Promise.resolve({ ok: false, reason: "timeout" });

const EMPTY_QUALITY: ProvinceDataQualityResult = {
  rows: [],
  suppressedProvinces: 0,
  unassigned: 0,
};

describe("panel independence — one degraded panel never drags the others", () => {
  it("index panel renders its card while the policy panel times out", async () => {
    const indexHtml = renderToStaticMarkup(
      await IntelIndexPanel({ load: ok<[never[], Record<string, number>]>([[], {}]), sp: {} }),
    );
    const policyHtml = renderToStaticMarkup(await IntelPolicyPanel({ load: timedOut(), sp: {} }));

    // Index panel: the real card (empty-state variant — honest, not degraded).
    expect(indexHtml).toContain("Índice territorial compuesto");
    expect(indexHtml).toContain("Sin datos suficientes");
    // Policy panel: the honest degraded fallback with a real retry link.
    expect(policyHtml).toContain("tardando más de lo normal");
    expect(policyHtml).toContain("Reintentar");
    expect(policyHtml).not.toContain("Política → resultado");
  });
});

describe("degraded panels", () => {
  it("quality panel timeout → AnalyticsLoadFallback with the scoped retry href (period kept)", async () => {
    const html = renderToStaticMarkup(
      await IntelQualityPanel({ load: timedOut(), sp: { period: "90d" } }),
    );
    expect(html).toContain("Reintentar");
    expect(html).toContain("/admin/inteligencia?period=90d");
  });

  it("quality panel error → the error variant of the fallback", async () => {
    const html = renderToStaticMarkup(
      await IntelQualityPanel({
        load: Promise.resolve({ ok: false, reason: "error" }),
        sp: {},
      }),
    );
    expect(html).toContain("No pudimos cargar los datos");
    expect(html).toContain("Reintentar");
  });

  it("policy panel renders real data when its own load succeeds", async () => {
    const html = renderToStaticMarkup(await IntelPolicyPanel({ load: ok([]), sp: {} }));
    expect(html).toContain("Política → resultado");
    expect(html).toContain("Sin cambios de reglas");
  });

  it("quality panel renders real data when its own load succeeds", async () => {
    const html = renderToStaticMarkup(await IntelQualityPanel({ load: ok(EMPTY_QUALITY), sp: {} }));
    expect(html).toContain("Calidad de datos por provincia");
  });
});

describe("degraded KPI tiles — explicit 'sin datos', never zeros", () => {
  it("index KPIs degrade to '—' + 'Sin datos por demora'", async () => {
    const html = renderToStaticMarkup(await IntelIndexKpis({ load: timedOut() }));
    expect(html).toContain("Provincias evaluadas");
    expect(html).toContain("Índice promedio");
    expect(html).toContain("Sin datos por demora");
    expect(html).not.toContain(">0<");
  });

  it("policy KPI degrades to '—' + 'Sin datos por demora'", async () => {
    const html = renderToStaticMarkup(await IntelPolicyKpi({ load: timedOut() }));
    expect(html).toContain("Cambios de reglas");
    expect(html).toContain("Sin datos por demora");
  });

  it("policy KPI renders the real window sub-line when its load succeeds", async () => {
    const html = renderToStaticMarkup(await IntelPolicyKpi({ load: ok([]) }));
    expect(html).toContain("Cambios de reglas");
    expect(html).not.toContain("Sin datos por demora");
  });
});
