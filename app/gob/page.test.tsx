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

vi.mock("@/lib/analytics/mortality-metrics", () => ({
  fetchMortalityHeadline: vi.fn(async () => ({ total: 12, traceableRate: 33 })),
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
    censusCoveragePct: 50,
  },
  sterilizations: { count: 10, deltaPct: 5, orgs: 2, prevCount: 9 },
  bitesPer10k: { percapitaEligible: true, reports: 3, rate: 1.2, delta: 0 },
  openRabiesObservations: { count: 0, deltaWeek: 0 },
  openBiteCases: { count: 0 },
  notifiedDiseases: { count: 0, lepto: 0, hidat: 0 },
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

vi.mock("@/lib/metrics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/metrics")>("@/lib/metrics");
  return {
    ...actual,
    fetchBitesTrend: vi.fn(async () => ({ points: [], granularity: "month", suppressedCount: 0 })),
    fetchKpiTrend: vi.fn(async () => ({ points: [] })),
  };
});

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
    expect(headerHtml).not.toContain("Cola de aprobaciones");
    expect(headerHtml).not.toContain("Habilitación");
    expect(headerHtml).not.toContain("Denuncias de maltrato");
    // Only title + mandate chrome + ViewScopeCaption remain.
    expect(headerHtml).toContain("Panel de jurisdicción");
  });

  it("Cola operativa renders individual cards — one per queue, each carrying its own live count (PO visual-validation batch B: no more condensed row)", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Cola de aprobaciones");
    expect(html).toContain("Habilitación de organizaciones");
    expect(html).toContain("Denuncias de maltrato");
    expect(html).toContain("Casos regulatorios");
    expect(html).toContain("Mascotas perdidas activas");
    // Every card carries its own count, including Habilitación (previously
    // the one queue WITHOUT a metric).
    expect(html).toContain("4"); // pendingCount (Cola de aprobaciones)
    expect(html).toContain("2"); // orgVerificationPendingCount (Habilitación)
    expect(html).toContain("6"); // openCasesTotal (Casos regulatorios)
    expect(html).toContain("5"); // perdidas.activeCount (Pérdidas activas)
  });

  it("a real gap (mortality traceability 33% vs meta 75%) surfaces as a priority-alta alert with its action + confidence", async () => {
    const node = await GobHomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("33%");
    // C1 fix (claim #6, cursor red-team 2026-07-23): law-sourced but
    // non-statutory target renders "Obligación: <ley> · Meta programática: X%".
    expect(html).toContain("Meta programática: 75%");
    expect(html).toContain("Ver en Mortalidad y disposición");
    expect(html).toMatch(/Confianza: (alta|media|baja)/);
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
