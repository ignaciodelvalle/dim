// @vitest-environment jsdom
//
// /gob (home) — C6b "THE BRIEFING" render smoke test (docs/reviews/results/
// 2026-07-22-plan-maestro-integridad.md §C6). Pins the PO-locked 4-block
// order (Alertas priorizadas → Brechas vs meta → Cola operativa condensada →
// Mi trabajo asignado → collapsed Novedades/Actividad reciente), the
// conditional "Mi trabajo" block, and that a real gap surfaces an alert
// carrying its action + confidence. Mirrors the /gob/cola and /gob/denuncias
// render-test pattern: mock every DB-touching fetcher, render via
// renderToStaticMarkup, assert on the resulting HTML.

import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(async () => ({
    user: { id: "govt-1", email: "govt@dim.test" },
    profile: { id: "govt-1", role: "govt" },
    jurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
  })),
}));

vi.mock("@/lib/analytics/jurisdiction-scope", () => ({
  resolveJurisdictionScope: vi.fn(async () => ({
    filteredJurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
    localities: [],
    allowedProvinces: [],
    adminSelectedProvince: null,
    adminSelectedLocality: null,
  })),
}));

vi.mock("@/lib/infra/approval-scope", () => ({
  countVisiblePendingRequests: vi.fn(async () => 4),
  // PO visual-validation batch B (2026-07-23): "Habilitación de
  // organizaciones" now carries its own live count.
  countVisiblePendingRequestsByType: vi.fn(async () => 2),
}));

vi.mock("@/lib/infra/case-queries", () => ({
  listOpenCasesForAdminPreview: vi.fn(async () => ({ items: [], total: 0 })),
  listOpenCasesForGovtPreview: vi.fn(async () => ({ items: [], total: 6 })),
}));

// Mutable so the A1 block below can drive an empty jurisdiction (0 deaths →
// zero-denominator) through the SAME page render, same as the other fixtures.
const mortalityFixture = { total: 12, traceableRate: 33 };

vi.mock("@/lib/analytics/mortality-metrics", () => ({
  fetchMortalityHeadline: vi.fn(async () => ({ ...mortalityFixture })),
}));

// Claim #4 (cursor red-team 2026-07-23) — the ONE new query the home page's
// surveillance-urgency alert candidates read (openBreaches only).
const surveillanceComplianceFixture = {
  closed: 0,
  closedWithinWindow: 0,
  compliancePct: null as number | null,
  openBreaches: 0,
};

vi.mock("@/lib/analytics/surveillance-metrics", () => ({
  fetchRabiesObservationCompliance: vi.fn(async () => surveillanceComplianceFixture),
}));

vi.mock("@/app/actions/novedades", () => ({
  markNovedadesSeenAction: vi.fn(),
}));

vi.mock("@/lib/metrics/novedades-feed", () => ({
  fetchNovedadesGroupedFeed: vi.fn(async () => ({ groups: [], sinceWatermark: null })),
}));

vi.mock("@/components/ui/dashboard/DashboardFreshnessFooter", () => ({
  DashboardFreshnessFooter: () => null,
}));

// TimeSeriesChartDynamic is next/dynamic with ssr:false — it renders only its
// skeleton under renderToStaticMarkup, so the real chart's own honest
// rendering of a masked bucket (a GAP in the line, "oculto (privacidad)" in
// the "Ver datos" table) can never be observed from here. What CAN be
// observed, and is exactly what broke, is the PROPS this page hands it: the
// page rebuilt every point as a bare `{ x, y }`, dropping the `suppressed`
// flag, so the chart was handed eleven honest-looking zeros. This stand-in
// serializes the props it receives so the test can assert the contract.
vi.mock("@/components/charts/TimeSeriesChartDynamic", () => ({
  TimeSeriesChartDynamic: (props: { data: unknown; suppressedCount?: number }) => (
    <div
      data-testid="timeseries-props"
      data-points={JSON.stringify(props.data)}
      data-suppressed-count={String(props.suppressedCount)}
    />
  ),
}));

vi.mock("@/db", async () => {
  const actual = await vi.importActual<typeof import("@/db")>("@/db");
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    },
  };
});

// Mutable fixture state so individual tests can adjust a handful of fields
// (e.g. myAssignedWelfareCount) without re-declaring the whole mock module.
const govtHomeKpisFixture = {
  rabiesCoverage: {
    current: 40,
    target: 80,
    partidos: 1,
    hasData: true,
    registryDenominator: 500,
    censusDenominator: 1000,
    // Nullable in the real fetcher (no census row for the scope) — the A1
    // block drives that case, so the fixture must not narrow it to `number`.
    censusCoveragePct: 50 as number | null,
    signedCount: 100,
    signedPct: 20,
  },
  sterilizations: { count: 10, deltaPct: 5, orgs: 2, prevCount: 9, signedCount: 4, signedPct: 40 },
  bitesPer10k: { percapitaEligible: true, reports: 3, rate: 1.2, delta: 0 },
  openRabiesObservations: { count: 0, deltaWeek: 0 },
  openBiteCases: { count: 0 },
  notifiedDiseases: { count: 0, lepto: 0, hidat: 0, other: 0 },
  openWelfareReports: { count: 2 },
};

vi.mock("@/lib/analytics/govt-home-kpis", () => ({
  fetchRabiesCoverage: vi.fn(async () => govtHomeKpisFixture.rabiesCoverage),
  fetchSterilizationMetrics: vi.fn(async () => govtHomeKpisFixture.sterilizations),
  fetchBitesPer10k: vi.fn(async () => govtHomeKpisFixture.bitesPer10k),
  fetchOpenRabiesObservations: vi.fn(async () => govtHomeKpisFixture.openRabiesObservations),
  fetchOpenBiteCases: vi.fn(async () => govtHomeKpisFixture.openBiteCases),
  fetchNotifiedDiseases: vi.fn(async () => govtHomeKpisFixture.notifiedDiseases),
  fetchOpenWelfareReportsCount: vi.fn(async () => govtHomeKpisFixture.openWelfareReports),
}));

const complianceFixture = {
  microchip: {
    ratePct: 30,
    chipped: 30,
    active: 100,
    byLocality: { value: [], suppressedCount: 0 },
  },
  breed: { flaggedCount: 0, ratePct: 0, attested: 0 },
};

vi.mock("@/lib/analytics/compliance-metrics", () => ({
  fetchMicrochipPenetration: vi.fn(async () => complianceFixture.microchip),
  fetchDangerousBreedCompliance: vi.fn(async () => complianceFixture.breed),
}));

const govtDashboardsFixture = { perdidasActiveCount: 5, myAssignedWelfareCount: 3 };

vi.mock("@/lib/analytics/govt-dashboards", () => ({
  fetchPerdidasMetrics: vi.fn(async () => ({
    activeCount: govtDashboardsFixture.perdidasActiveCount,
  })),
  fetchMyAssignedWelfareCount: vi.fn(async () => govtDashboardsFixture.myAssignedWelfareCount),
}));

// Mutable so the suppression block below can drive a masked series through the
// SAME page render. Default stays the empty series every other test expects.
const bitesTrendFixture: {
  points: Array<{ x: string; y: number; suppressed?: true }>;
  granularity: string;
  suppressedCount: number;
} = { points: [], granularity: "month", suppressedCount: 0 };

vi.mock("@/lib/metrics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/metrics")>("@/lib/metrics");
  return {
    ...actual,
    fetchBitesTrend: vi.fn(async () => bitesTrendFixture),
    fetchKpiTrend: vi.fn(async () => ({ points: [] })),
  };
});

import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";

import GobHomePage from "./page";

function idx(html: string, needle: string): number {
  const i = html.indexOf(needle);
  expect(i, `expected to find "${needle}" in the rendered HTML`).toBeGreaterThanOrEqual(0);
  return i;
}

describe("/gob (home) — C6b briefing block order", () => {
  it("renders the 4 PO-locked blocks in strict order: Alertas → Brechas vs meta → Cola operativa → Mi trabajo → Actividad reciente", async () => {
    govtDashboardsFixture.myAssignedWelfareCount = 3;
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);

    const alertasIdx = idx(html, "Alertas priorizadas");
    const brechasIdx = idx(html, "Brechas vs meta");
    const colaIdx = idx(html, "Cola operativa");
    const miTrabajoIdx = idx(html, "Mi trabajo asignado");
    const actividadIdx = idx(html, "Actividad reciente");

    expect(alertasIdx).toBeLessThan(brechasIdx);
    expect(brechasIdx).toBeLessThan(colaIdx);
    expect(colaIdx).toBeLessThan(miTrabajoIdx);
    expect(miTrabajoIdx).toBeLessThan(actividadIdx);
  });

  it("header carries NO primary action — no lone CTA button at the top (PO visual-validation batch B)", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    const headerEnd = html.indexOf("</header>");
    const headerHtml = html.slice(0, headerEnd);
    expect(headerHtml).not.toContain("Aprobaciones");
    expect(headerHtml).not.toContain("Habilitación");
    expect(headerHtml).not.toContain("Denuncias de maltrato");
    // Only title + mandate chrome + ViewScopeCaption remain.
    expect(headerHtml).toContain("Panel de jurisdicción");
  });

  it("Cola operativa renders individual cards — one per queue, each carrying its own live count (PO visual-validation batch B: no more condensed row)", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Aprobaciones");
    expect(html).toContain("Habilitación de organizaciones");
    expect(html).toContain("Denuncias de maltrato");
    expect(html).toContain("Casos regulatorios");
    expect(html).toContain("Mascotas perdidas activas");
    // Every card carries its own count, including Habilitación (previously
    // the one queue WITHOUT a metric).
    expect(html).toContain("4"); // pendingCount (Aprobaciones)
    expect(html).toContain("2"); // orgVerificationPendingCount (Habilitación)
    expect(html).toContain("6"); // openCasesTotal (Casos regulatorios)
    expect(html).toContain("5"); // perdidas.activeCount (Pérdidas activas)
  });

  it("a real gap (mortality traceability 33% vs meta 75%) surfaces as a priority-alta alert with its action + confidence", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    // Rounding-drift fix (qa-triage-2026-07-23 finding #6): the alert routes
    // through the SAME 1-decimal formatPercent every KPI tile uses, so an
    // exact 33 renders "33,0%" — matching the tile below it verbatim, never a
    // bare 0-decimal "33%" that could silently disagree with it.
    expect(html).toContain("33,0%");
    // C1 fix (claim #6, cursor red-team 2026-07-23): law-sourced but
    // non-statutory target renders "Obligación: <ley> · Meta programática: X%".
    expect(html).toContain("Meta programática: 75%");
    expect(html).toContain("Ver en Mortalidad y disposición");
    expect(html).toMatch(/Confianza: (alta|media|baja)/);
  });

  // Live on /gob 2026-07-25: the evidence line read "Confianza: alta · n =
  // 67519" while the resource clause beside it read "faltan ~29.708 chips" —
  // two number systems in one sentence. It survived because EVERY fixture in
  // this file is under a thousand (500, 1000, 100, 10, 3), so no test ever
  // exercised the separator. Same root cause as the briefing-alerts leak.
  it("formats an evidence n over a thousand with the es-AR separator", async () => {
    const prev = govtHomeKpisFixture.rabiesCoverage.registryDenominator;
    govtHomeKpisFixture.rabiesCoverage.registryDenominator = 67519;
    try {
      const node = await GobHomePage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(node);
      expect(html).toContain("n = 67.519");
      expect(html).not.toContain("n = 67519");
    } finally {
      govtHomeKpisFixture.rabiesCoverage.registryDenominator = prev;
    }
  });

  it("collapses Novedades/Actividad reciente inside a closed-by-default <details>", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    // A <details> element is present, WITHOUT an `open` attribute.
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\bopen\b[^>]*>/);
    expect(html).toContain("Actividad reciente");
  });
});

// ---------------------------------------------------------------------------
// A1 (2026-07-31) — the automatic green.
//
// The Alertas block rendered "Sin alertas activas — las métricas con meta
// están dentro de rango." whenever the alert list was empty, and the briefing
// engine returns an empty list for "nothing was measured" just as readily as
// for "every target was met". A jurisdiction with no data loaded therefore got
// a clean bill of health from a screen that had measured nothing — the single
// most expensive kind of error to put in front of a funcionario.
//
// These tests drive the page with a genuinely empty jurisdiction and assert
// the screen says so.
// ---------------------------------------------------------------------------

describe("/gob (home) — the empty briefing states WHICH emptiness it is (A1)", () => {
  /** Zero every input the briefing reads, then restore it. */
  async function renderWithEmptyJurisdiction(): Promise<string> {
    const prev = {
      rabiesCoverage: { ...govtHomeKpisFixture.rabiesCoverage },
      microchip: { ...complianceFixture.microchip },
      bites: { ...govtHomeKpisFixture.bitesPer10k },
      mortality: { ...mortalityFixture },
    };
    // hasData is literally `totalDogs > 0`, so an empty padrón is both flags.
    govtHomeKpisFixture.rabiesCoverage.hasData = false;
    govtHomeKpisFixture.rabiesCoverage.registryDenominator = 0;
    govtHomeKpisFixture.rabiesCoverage.current = 0;
    govtHomeKpisFixture.rabiesCoverage.censusCoveragePct = null;
    complianceFixture.microchip.active = 0;
    complianceFixture.microchip.ratePct = 0;
    // No bites reported → the escalation-gap urgency signal stays silent too,
    // so the alert list is empty for data reasons only.
    govtHomeKpisFixture.bitesPer10k.reports = 0;
    mortalityFixture.total = 0;
    mortalityFixture.traceableRate = 0;
    try {
      const node = await GobHomePage({ searchParams: Promise.resolve({}) });
      return renderToStaticMarkup(node);
    } finally {
      Object.assign(govtHomeKpisFixture.rabiesCoverage, prev.rabiesCoverage);
      Object.assign(complianceFixture.microchip, prev.microchip);
      Object.assign(govtHomeKpisFixture.bitesPer10k, prev.bites);
      Object.assign(mortalityFixture, prev.mortality);
    }
  }

  it("never tells a jurisdiction with zero measurements that its metrics are within range", async () => {
    const html = await renderWithEmptyJurisdiction();
    expect(html).toContain("Alertas priorizadas");
    expect(html).not.toContain("dentro de rango");
  });

  it("names the metrics it could not measure, instead of a blanket verdict", async () => {
    const html = await renderWithEmptyJurisdiction();
    expect(html).toContain("ninguna métrica con meta tiene una medición evaluable en este período");
    expect(html).toContain("Sin medición en este período");
    // Named one by one, with the same labels the tiles below use — a
    // funcionario can check each claim against the strip on the same screen.
    expect(html).toContain(KPI_CATALOG.rabies_coverage_dogs_12m.label);
    expect(html).toContain(KPI_CATALOG.microchip_penetration.label);
    expect(html).toContain(KPI_CATALOG.mortality_disposal_traceability.label);
  });

  it("still says 'dentro de rango' when the metrics really were measured and met", async () => {
    const prev = {
      rabiesCoverage: { ...govtHomeKpisFixture.rabiesCoverage },
      microchip: { ...complianceFixture.microchip },
      bites: { ...govtHomeKpisFixture.bitesPer10k },
      mortality: { ...mortalityFixture },
    };
    govtHomeKpisFixture.rabiesCoverage.current = 95;
    complianceFixture.microchip.ratePct = 95;
    govtHomeKpisFixture.bitesPer10k.reports = 0;
    mortalityFixture.traceableRate = 95;
    try {
      const node = await GobHomePage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(node);
      expect(html).toContain("3 métricas con meta están dentro de rango");
    } finally {
      Object.assign(govtHomeKpisFixture.rabiesCoverage, prev.rabiesCoverage);
      Object.assign(complianceFixture.microchip, prev.microchip);
      Object.assign(govtHomeKpisFixture.bitesPer10k, prev.bites);
      Object.assign(mortalityFixture, prev.mortality);
    }
  });
});

// ---------------------------------------------------------------------------
// SUPPRESSED ≠ CERO (demo review 2026-08-01).
//
// The "Mordeduras por mes" card headed itself "11 períodos ocultos
// (privacidad)" and then published those eleven months as the VALUE 0 in its
// "Ver datos" table, under a KPI reading 37 reportes — a total that cannot be
// reconciled with the series beneath it. The same suppression, in the Panorama
// CSV and PNG, already writes "Protegido (k<5)". A zero is an epidemiological
// claim; a mask is the absence of one, and the whole privacy apparatus of this
// project exists so the two are never confused.
//
// Two independent causes, both fixed: SingleSeriesTrend's `points` type erased
// the `suppressed` flag suppressSmallBuckets emits, and this page then rebuilt
// each point as a bare `{ x, y }` anyway.
// ---------------------------------------------------------------------------

describe("/gob (home) — a k-anon-masked bite bucket is never published as a measured zero", () => {
  const MASKED_SERIES: Array<{ x: string; y: number; suppressed?: true }> = [
    { x: "jul 25", y: 0, suppressed: true },
    { x: "ago 25", y: 0 },
    { x: "jun 26", y: 14 },
  ];

  async function renderWithMaskedTrend(): Promise<string> {
    const prev = { ...bitesTrendFixture, points: bitesTrendFixture.points };
    bitesTrendFixture.points = MASKED_SERIES;
    bitesTrendFixture.suppressedCount = 1;
    try {
      const node = await GobHomePage({ searchParams: Promise.resolve({}) });
      return renderToStaticMarkup(node);
    } finally {
      Object.assign(bitesTrendFixture, prev);
    }
  }

  /** The serialized `data` prop the page hands TimeSeriesChartDynamic. */
  function chartPoints(html: string): Array<{ x: string; y: number; suppressed?: true }> {
    const match = html.match(/data-points="([^"]*)"/);
    expect(match, "expected the page to render a TimeSeriesChart with a data prop").not.toBeNull();
    // renderToStaticMarkup escapes the JSON's quotes into the attribute.
    const json = (match as RegExpMatchArray)[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return JSON.parse(json);
  }

  it("forwards the suppressed flag to the chart instead of a bare {x, y} zero", async () => {
    const html = await renderWithMaskedTrend();
    const points = chartPoints(html);
    expect(points).toHaveLength(3);
    // THE REGRESSION: this flag is what makes TimeSeriesChart draw a gap and
    // print "oculto (privacidad)" in its accessible table. Stripping it turns
    // a privacy mask into a measured zero.
    expect(points[0]).toEqual({ x: "jul 25", y: 0, suppressed: true });
  });

  it("leaves a genuine measured zero unflagged — a real dip must stay visible", async () => {
    const html = await renderWithMaskedTrend();
    const points = chartPoints(html);
    expect(points[1]).toEqual({ x: "ago 25", y: 0 });
    expect(points[1]).not.toHaveProperty("suppressed");
  });

  it("passes suppressedCount so a fully masked series says so instead of reading as empty", async () => {
    const html = await renderWithMaskedTrend();
    expect(html).toContain('data-suppressed-count="1"');
  });

  it("still discloses the masked-period count in the card header", async () => {
    const html = await renderWithMaskedTrend();
    expect(html).toContain("1 período oculto (privacidad)");
  });
});

describe("/gob (home) — Mi trabajo asignado: conditional rendering", () => {
  it("hides the block entirely when the viewer has 0 assigned welfare reports", async () => {
    govtDashboardsFixture.myAssignedWelfareCount = 0;
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Mi trabajo asignado");
  });

  it("shows the block with its count + link when non-zero, as the same 'de a 1' OpKpi-tile card Cola operativa uses (PO visual-validation batch B)", async () => {
    govtDashboardsFixture.myAssignedWelfareCount = 7;
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Mi trabajo asignado");
    expect(html).toContain("7");
    expect(html).toContain("Denuncias de maltrato asignadas");
    // F1 fusion (2026-07-22): Maltrato is now the Denuncias hub's "Triage"
    // stage — the link points straight there, not through the old redirect.
    // (& is HTML-escaped to &amp; in the rendered markup.)
    expect(html).toContain("/gob/denuncias?etapa=triage&amp;queue=mine");
  });

  it("uses the singular label when exactly 1 report is assigned", async () => {
    govtDashboardsFixture.myAssignedWelfareCount = 1;
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Denuncia de maltrato asignada");
    expect(html).not.toContain("Denuncias de maltrato asignadas");
  });
});
