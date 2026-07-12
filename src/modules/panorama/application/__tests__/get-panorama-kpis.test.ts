// Unit test for the panorama KPI use-case. The dashboard fetchers are mocked,
// so this runs with NO database — it verifies the orchestration, that scope +
// period are threaded UNTOUCHED to the tested fetchers (parity), and that the
// values are formatted/labelled correctly. The whole selling point is that the
// console reuses the SAME fetchers as the dashboards; this test pins that.

import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTE: the mock paths MUST match the SUT's import specifiers exactly
// (@/lib/analytics/…). They used to point at @/lib/govt-* — nonexistent
// modules — so the REAL fetchers loaded and vi.mocked(...) wrapped plain
// functions (mockResolvedValue crashed). Fixed alongside the map-QOL deltas.
vi.mock("@/lib/analytics/govt-dashboards", () => ({
  fetchAnalyticsMetrics: vi.fn(),
  fetchPerdidasMetrics: vi.fn(),
}));
vi.mock("@/lib/analytics/govt-home-kpis", () => ({
  fetchRabiesCoverage: vi.fn(),
  fetchBitesPer10k: vi.fn(),
  fetchActiveZoonosis: vi.fn(),
  fetchOpenWelfareReportsCount: vi.fn(),
}));
vi.mock("@/lib/metrics/population-control", () => ({
  fetchSterilizationCoverage: vi.fn(),
}));
vi.mock("@/lib/metrics/freshness", () => ({
  lastIngestAt: vi.fn(),
}));
// v+1 rail — meta-progress meters (D4 reunification + C1 microchip).
vi.mock("@/lib/analytics/compliance-metrics", () => ({
  fetchReunificationRate: vi.fn(),
  fetchMicrochipPenetration: vi.fn(),
}));
// v+1 rail — KPI sparklines (same trend fetchers /gob home uses).
vi.mock("@/lib/metrics/trends", () => ({
  fetchRabiesVaccinationTrend: vi.fn(),
  fetchBitesTrend: vi.fn(),
  fetchKpiTrend: vi.fn(),
}));

import {
  fetchMicrochipPenetration,
  fetchReunificationRate,
} from "@/lib/analytics/compliance-metrics";
import { fetchAnalyticsMetrics, fetchPerdidasMetrics } from "@/lib/analytics/govt-dashboards";
import {
  fetchActiveZoonosis,
  fetchBitesPer10k,
  fetchOpenWelfareReportsCount,
  fetchRabiesCoverage,
} from "@/lib/analytics/govt-home-kpis";
import type { AnalyticsPeriod } from "@/lib/metrics";
import { lastIngestAt } from "@/lib/metrics/freshness";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { fetchBitesTrend, fetchKpiTrend, fetchRabiesVaccinationTrend } from "@/lib/metrics/trends";

import {
  PanoramaKpisUnavailableError,
  degradedPanoramaKpis,
  getPanoramaKpis,
} from "../get-panorama-kpis";

const period: AnalyticsPeriod = {
  since: new Date("2025-06-20T00:00:00.000Z"),
  until: new Date("2026-06-20T00:00:00.000Z"),
};

function seedDefaults() {
  vi.mocked(fetchRabiesCoverage).mockResolvedValue({
    current: 72.4,
    target: 80,
    partidos: 3,
    hasData: true,
    registryDenominator: 12_480,
    censusDenominator: 474_333,
    censusCoveragePct: 2.6,
  });
  vi.mocked(fetchAnalyticsMetrics).mockResolvedValue({
    totalPets: 12345,
    adoptionRate: 0,
    rabiesVaccinationRate: 0,
    custodyDisputes: 0,
  });
  vi.mocked(fetchPerdidasMetrics).mockResolvedValue({
    activeCount: 42,
    recoveredMonth: 7,
    avgDaysActive: 5,
  });
  vi.mocked(fetchBitesPer10k).mockResolvedValue({ rate: 3.5, delta: 0, reports: 18 });
  vi.mocked(fetchActiveZoonosis).mockResolvedValue({
    count: 9,
    rabies: 2,
    lepto: 1,
    hidat: 0,
    deltaWeek: 0,
  });
  vi.mocked(fetchOpenWelfareReportsCount).mockResolvedValue({ count: 4, inPeriod: 4 });
  vi.mocked(fetchSterilizationCoverage).mockResolvedValue({
    rate: 65.7,
    sterilized: 657,
    total: 1000,
    byProvince: [],
  });
  vi.mocked(lastIngestAt).mockResolvedValue(new Date("2026-06-19T18:30:00.000Z"));
  // v+1 rail defaults.
  vi.mocked(fetchReunificationRate).mockResolvedValue({
    ratePct: 45.2,
    recovered: 19,
    lostEpisodes: 42,
    medianDaysToRecovery: 3,
  });
  vi.mocked(fetchMicrochipPenetration).mockResolvedValue({
    ratePct: 55.1,
    chipped: 551,
    active: 1000,
    byLocality: { value: [] as never, suppressedCount: 0 },
  });
  vi.mocked(fetchRabiesVaccinationTrend).mockResolvedValue({
    granularity: "month",
    points: [
      { x: "ene", y: 10 },
      { x: "feb", y: 14 },
    ],
    suppressedCount: 0,
  });
  vi.mocked(fetchBitesTrend).mockResolvedValue({
    granularity: "month",
    points: [
      { x: "ene", y: 3 },
      { x: "feb", y: 5 },
    ],
    suppressedCount: 0,
  });
  vi.mocked(fetchKpiTrend).mockResolvedValue({
    granularity: "month",
    points: [
      { x: "ene", y: 1 },
      { x: "feb", y: 2 },
    ],
    suppressedCount: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDefaults();
});

describe("getPanoramaKpis", () => {
  it("returns 8 headline KPIs in display order, each backed by a named dashboard fetcher", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    // Legal-analysis reorientation (2026-07-03): the two legally-grounded
    // compliance coverages lead. v+1 rail: "microchip" joins the compliance
    // trio; "reunificacion" (D4) sits next to "perdidas". metric-honesty
    // 2026-07-09: "mascotas" (the coverage DENOMINATOR) is no longer a headline
    // tile — it moved to the `coverageDenominator` footer field.
    expect(kpis.map((k) => k.id)).toEqual([
      "cobertura",
      "esterilizacion",
      "microchip",
      "perdidas",
      "reunificacion",
      "mordeduras",
      "zoonosis",
      "denuncias",
    ]);
    // Parity proof: every KPI names the fetcher that produced it.
    expect(kpis.map((k) => k.source)).toEqual([
      "govt-home-kpis.fetchRabiesCoverage",
      "metrics.fetchSterilizationCoverage",
      "compliance-metrics.fetchMicrochipPenetration",
      "govt-dashboards.fetchPerdidasMetrics",
      "compliance-metrics.fetchReunificationRate",
      "govt-home-kpis.fetchBitesPer10k",
      "govt-home-kpis.fetchActiveZoonosis",
      "govt-home-kpis.fetchOpenWelfareReportsCount",
    ]);
    // The coverage denominator is NOT a headline tile anymore.
    expect(kpis.some((k) => k.id === "mascotas")).toBe(false);
  });

  it("demotes the coverage denominator to a footer field, not a headline tile (metric-honesty)", async () => {
    const result = await getPanoramaKpis({ role: "admin" }, [], period);
    // fetchAnalyticsMetrics.totalPets (12345) now rides `coverageDenominator`,
    // formatted as a footer caption by PanoramaKpiFooter — never a decision KPI.
    expect(result.coverageDenominator).toEqual({ totalPets: 12345, href: "/gob/analytics" });
    expect(result.kpis.some((k) => k.label === "Mascotas en cobertura")).toBe(false);
  });

  it("formats values with es-AR conventions and surfaces an info tooltip per KPI", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    // Percentage — one decimal, es-AR comma (72.4 → "72,4%").
    expect(byId.cobertura.value).toBe("72,4%");
    expect(byId.cobertura.bar).toBe(72.4);
    expect(byId.cobertura.tone).toBe("warn"); // 72.4 < target 80

    // Decimal comma (es-AR) — 3.5 → "3,5".
    expect(byId.mordeduras.value).toBe("3,5");
    expect(byId.perdidas.value).toBe("42");
    expect(byId.zoonosis.value).toBe("9");
    expect(byId.denuncias.value).toBe("4");

    // esterilizacion KPI — decimal precision survives to the display (65,7%).
    expect(byId.esterilizacion.value).toBe("65,7%");
    expect(byId.esterilizacion.bar).toBe(65.7);
    expect(byId.esterilizacion.tone).toBe("warn"); // 65.7 < target 70
    expect(byId.esterilizacion.sub).toBe("meta 70%");

    // Every KPI carries a non-empty info tooltip (the ⓘ definition).
    for (const k of kpis) {
      expect(k.info.definition.length).toBeGreaterThan(0);
      expect(k.href.startsWith("/gob/")).toBe(true);
    }
  });

  it("esterilizacion KPI is tone ok when rate >= 70", async () => {
    vi.mocked(fetchSterilizationCoverage).mockResolvedValue({
      rate: 75.3,
      sterilized: 753,
      total: 1000,
      byProvince: [],
    });
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const kpi = kpis.find((k) => k.id === "esterilizacion")!;
    expect(kpi.tone).toBe("ok");
    expect(kpi.value).toBe("75,3%");
  });

  it("threads the SAME (actor, jurisdictions, period) to the dashboard fetchers (no scope widening)", async () => {
    const jur = [{ province: "Salta", locality: "Salta" }];
    await getPanoramaKpis({ role: "govt" }, jur, period);

    // ctx-based fetchers receive a ProjectionContext built from the exact tuple.
    const ctxArg = vi.mocked(fetchRabiesCoverage).mock.calls[0][0];
    expect(ctxArg.actor).toEqual({ role: "govt" });
    expect(ctxArg.scope).toEqual({ kind: "jurisdictions", jurisdictions: jur });
    expect(ctxArg.period).toBe(period);

    // (actor, jurisdictions, opts) fetchers get the same actor + jurisdictions,
    // with the period's `since` threaded so they are period-aware.
    expect(fetchAnalyticsMetrics).toHaveBeenCalledWith({ role: "govt" }, jur, {
      since: period.since,
    });
    expect(fetchPerdidasMetrics).toHaveBeenCalledWith({ role: "govt" }, jur, {
      adminProvince: undefined,
      adminLocality: undefined,
    });
  });

  it("describes the recalculation alcance for admin vs scoped govt", async () => {
    const admin = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(admin.recalculatedFor).toContain("nacional");

    const govt = await getPanoramaKpis(
      { role: "govt" },
      [{ province: "Córdoba", locality: "Córdoba" }],
      period,
    );
    expect(govt.recalculatedFor).toContain("Córdoba");
  });

  it("names the LOCALITY, not just the province, for a single-locality-scoped govt operator (QA 2026-07-11 §3)", async () => {
    // A Palermo-scoped (CABA) govt operator previously saw "Recalculado para
    // CABA" — the copy named the province and silently dropped the narrower
    // locality scope, reading as if the whole province had been recalculated.
    const govt = await getPanoramaKpis(
      { role: "govt" },
      [{ province: "CABA", locality: "Palermo" }],
      period,
    );
    expect(govt.recalculatedFor).toContain("Palermo");
    expect(govt.recalculatedFor).toContain("CABA");
  });

  it("does NOT claim national reach for a govt operator with an empty scope (QA #81)", async () => {
    // A govt actor whose scope narrowed to [] (e.g. a province selected OUTSIDE
    // their assignment) must not read "alcance nacional" — that's admin-only.
    const govtEmpty = await getPanoramaKpis({ role: "govt" }, [], period);
    expect(govtEmpty.recalculatedFor).toContain("Sin datos en tu alcance");
    expect(govtEmpty.recalculatedFor.toLowerCase()).not.toContain("nacional");
  });

  it("uses a neutral tone when there is nothing to flag (zero counts)", async () => {
    vi.mocked(fetchActiveZoonosis).mockResolvedValue({
      count: 0,
      rabies: 0,
      lepto: 0,
      hidat: 0,
      deltaWeek: 0,
    });
    vi.mocked(fetchOpenWelfareReportsCount).mockResolvedValue({ count: 0, inPeriod: 0 });
    vi.mocked(fetchPerdidasMetrics).mockResolvedValue({
      activeCount: 0,
      recoveredMonth: 0,
      avgDaysActive: 0,
    });

    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));
    expect(byId.zoonosis.tone).toBe("neutral");
    expect(byId.denuncias.tone).toBe("neutral");
    expect(byId.perdidas.tone).toBe("neutral");
  });

  // ---------------------------------------------------------------------------
  // map-QOL: period-over-period deltas + freshness
  // ---------------------------------------------------------------------------

  it("attaches deltas ONLY to window-sensitive KPIs, computed against the prior window", async () => {
    // Current run first, prior run second (Promise.all evaluates in order).
    vi.mocked(fetchRabiesCoverage)
      .mockResolvedValueOnce({
        current: 72,
        target: 80,
        partidos: 3,
        hasData: true,
        registryDenominator: 12_480,
        censusDenominator: 474_333,
        censusCoveragePct: 2.6,
      })
      .mockResolvedValueOnce({
        current: 60,
        target: 80,
        partidos: 3,
        hasData: true,
        registryDenominator: 11_000,
        censusDenominator: 474_333,
        censusCoveragePct: 2.3,
      });
    vi.mocked(fetchBitesPer10k)
      .mockResolvedValueOnce({ rate: 3.5, delta: 0, reports: 18 })
      .mockResolvedValueOnce({ rate: 7, delta: 0, reports: 30 });

    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    // cobertura: 72 vs 60 → +12 POINTS (H9: a percentage KPI reports its delta in
    // pts, not a relative % of a % — the "+76%" the cowork QA flagged).
    expect(byId.cobertura.delta).toEqual({
      pct: 12,
      unit: "pts",
      direction: "up",
      label: "+12 pts vs período anterior",
    });
    // mordeduras: 3.5 vs 7 → -50% (per-10k rate keeps relative %, not points).
    expect(byId.mordeduras.delta?.pct).toBe(-50);
    expect(byId.mordeduras.delta?.unit).toBe("pct");
    expect(byId.mordeduras.delta?.direction).toBe("down");
    // zoonosis: same mock both runs → 0%, flat (still meaningful: window metric).
    expect(byId.zoonosis.delta?.direction).toBe("flat");

    // State metrics NEVER carry a delta (no misleading 0% on stocks/queues).
    expect(byId.perdidas.delta).toBeUndefined();
    expect(byId.denuncias.delta).toBeUndefined();
    expect(byId.esterilizacion.delta).toBeUndefined();
  });

  it("omits the delta when the prior value is 0 (no meaningful % base)", async () => {
    vi.mocked(fetchActiveZoonosis)
      .mockResolvedValueOnce({ count: 9, rabies: 2, lepto: 1, hidat: 0, deltaWeek: 0 })
      .mockResolvedValueOnce({ count: 0, rabies: 0, lepto: 0, hidat: 0, deltaWeek: 0 });

    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(kpis.find((k) => k.id === "zoonosis")?.delta).toBeUndefined();
  });

  it("runs the prior window IMMEDIATELY before the active one, same length and scope", async () => {
    await getPanoramaKpis({ role: "admin" }, [], period);

    // Three calls: current ctx, prior-window ctx, and the verifiedOnly ctx for the
    // "firmado por matrícula" sub (task #78 Part 3). Prior is call index 1.
    expect(fetchRabiesCoverage).toHaveBeenCalledTimes(3);
    const priorCtx = vi.mocked(fetchRabiesCoverage).mock.calls[1][0];
    // The prior window ends exactly where the active one starts…
    expect(priorCtx.period.until).toEqual(period.since);
    // …and spans the same length (365d here → prior-12m via windows.trailing24m).
    const priorLen = priorCtx.period.until.getTime() - priorCtx.period.since.getTime();
    const currentLen = period.until.getTime() - period.since.getTime();
    expect(Math.round(priorLen / 86_400_000)).toBe(Math.round(currentLen / 86_400_000));
    // Scope is identical (no widening in the comparison run).
    expect(priorCtx.scope).toEqual(vi.mocked(fetchRabiesCoverage).mock.calls[0][0].scope);
  });

  // ---------------------------------------------------------------------------
  // Coherence hybrid (cowork QA H1/H6): the temporal KPIs track the as-of scrub;
  // the stock KPIs stay current-state; denuncias splits in-period vs backlog.
  // ---------------------------------------------------------------------------

  it("recomputes TEMPORAL KPIs as-of the scrub cutoff, but STOCK KPIs stay live (H1)", async () => {
    const asOf = new Date("2026-05-01T00:00:00.000Z"); // inside [since, until]
    await getPanoramaKpis({ role: "admin" }, [], period, undefined, undefined, asOf);

    // Temporal fetchers see a ctx whose window ENDS at the as-of cutoff — so their
    // numbers move with the scrubber exactly like the map layers do.
    expect(vi.mocked(fetchBitesPer10k).mock.calls[0][0].period.until).toEqual(asOf);
    expect(vi.mocked(fetchActiveZoonosis).mock.calls[0][0].period.until).toEqual(asOf);
    expect(vi.mocked(fetchOpenWelfareReportsCount).mock.calls[0][0].period.until).toEqual(asOf);

    // Current-state fetchers keep the LIVE window (until = period.until) — a
    // coverage snapshot cannot vary with a corte; it is labeled "estado actual".
    expect(vi.mocked(fetchRabiesCoverage).mock.calls[0][0].period.until).toEqual(period.until);
    expect(vi.mocked(fetchSterilizationCoverage).mock.calls[0][0].period.until).toEqual(
      period.until,
    );
  });

  it("collapses to the live ctx when asOf is null — no behavior change on the live view", async () => {
    await getPanoramaKpis({ role: "admin" }, [], period, undefined, undefined, null);
    // The temporal fetchers see the plain live window (until = period.until).
    expect(vi.mocked(fetchBitesPer10k).mock.calls[0][0].period.until).toEqual(period.until);
    expect(vi.mocked(fetchActiveZoonosis).mock.calls[0][0].period.until).toEqual(period.until);
  });

  it("marks the stock KPIs as currentState and leaves the temporal ones unmarked", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));
    for (const id of ["cobertura", "esterilizacion", "microchip", "perdidas", "reunificacion"]) {
      expect(byId[id].currentState).toBe(true);
    }
    for (const id of ["mordeduras", "zoonosis", "denuncias"]) {
      expect(byId[id].currentState).toBeFalsy();
    }
  });

  it("splits denuncias into an in-period PRIMARY and a labeled backlog SECONDARY (H6)", async () => {
    vi.mocked(fetchOpenWelfareReportsCount).mockResolvedValue({ count: 2202, inPeriod: 195 });
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const denuncias = kpis.find((k) => k.id === "denuncias")!;
    // PRIMARY = the in-period count (matches the map + Registros), NOT the backlog.
    expect(denuncias.value).toBe("195");
    // SECONDARY carries the all-time backlog, clearly labeled.
    expect(denuncias.secondary).toContain("backlog");
    expect(denuncias.secondary).toContain("2.202");
  });

  // ---------------------------------------------------------------------------
  // task #78 Part 3 — the ministry "both numbers": total coverage as the headline,
  // firmado-por-matrícula share in the sub, via a SECOND verifiedOnly ctx.
  // ---------------------------------------------------------------------------

  it("computes a signed-only (verifiedOnly) coverage and surfaces it in the cobertura sub", async () => {
    vi.mocked(fetchRabiesCoverage)
      .mockResolvedValueOnce({
        current: 41.3,
        target: 80,
        partidos: 12,
        hasData: true,
        registryDenominator: 12_480,
        censusDenominator: 474_333,
        censusCoveragePct: 2.6,
      }) // total ctx
      .mockResolvedValueOnce({
        current: 39,
        target: 80,
        partidos: 12,
        hasData: true,
        registryDenominator: 11_800,
        censusDenominator: 474_333,
        censusCoveragePct: 2.5,
      }) // prior ctx
      .mockResolvedValueOnce({
        current: 28.9,
        target: 80,
        partidos: 12,
        hasData: true,
        registryDenominator: 12_480,
        censusDenominator: 474_333,
        censusCoveragePct: 2.6,
      }); // verified ctx

    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const cobertura = kpis.find((k) => k.id === "cobertura")!;

    // The headline value/bar stay TOTAL coverage.
    expect(cobertura.value).toBe("41,3%");
    expect(cobertura.bar).toBe(41.3);
    // The firmado-por-matrícula share rides in the sub alongside the meta.
    expect(cobertura.sub).toContain("28,9% firmado por matrícula");
    expect(cobertura.sub).toContain("meta 80%");

    // A THIRD fetch runs with a verifiedOnly ctx — numerator-only, never widening scope.
    expect(fetchRabiesCoverage).toHaveBeenCalledTimes(3);
    const verifiedCtx = vi.mocked(fetchRabiesCoverage).mock.calls[2][0];
    expect(verifiedCtx.verifiedOnly).toBe(true);
    expect(verifiedCtx.scope).toEqual(vi.mocked(fetchRabiesCoverage).mock.calls[0][0].scope);
  });

  // ---------------------------------------------------------------------------
  // task #79 — honest double denominators: the cobertura tile names BOTH the
  // registry count `current` is a % of AND how much of the estimated canine
  // population the padrón covers.
  // ---------------------------------------------------------------------------

  it("names both denominators in the cobertura sub: registry count + census coverage %", async () => {
    // seedDefaults: registryDenominator 12.480, censusCoveragePct 2,6.
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const cobertura = kpis.find((k) => k.id === "cobertura")!;

    // First denominator: the registry count `current` is computed against.
    expect(cobertura.sub).toContain("12.480 perros en el padrón");
    // Second denominator: registry coverage of the estimated canine population.
    expect(cobertura.sub).toContain("el padrón cubre 2,6% de la población canina estimada");
    // Both signature share and meta still present.
    expect(cobertura.sub).toContain("firmado por matrícula");
    expect(cobertura.sub).toContain("meta 80%");
  });

  it("degrades to 'sin estimación censal' when the scope has no census row", async () => {
    vi.mocked(fetchRabiesCoverage).mockResolvedValue({
      current: 41.3,
      target: 80,
      partidos: 12,
      hasData: true,
      registryDenominator: 12_480,
      censusDenominator: null,
      censusCoveragePct: null,
    });
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const cobertura = kpis.find((k) => k.id === "cobertura")!;

    // Registry denominator still named; census half honestly says it's missing.
    expect(cobertura.sub).toContain("12.480 perros en el padrón");
    expect(cobertura.sub).toContain("sin estimación censal");
    expect(cobertura.sub).not.toContain("población canina estimada");
  });

  it("surfaces the freshness timestamp as an ISO string (null-safe)", async () => {
    const result = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(result.dataAsOf).toBe("2026-06-19T18:30:00.000Z");

    vi.mocked(lastIngestAt).mockResolvedValue(null);
    const empty = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(empty.dataAsOf).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // v+1 rail — KPI sparklines (item 1): cobertura/mordeduras/zoonosis carry an
  // inline sparkline series sourced from the SAME trend fetchers /gob home uses.
  // ---------------------------------------------------------------------------

  it("attaches a sparkline to cobertura, mordeduras and zoonosis (window-sensitive KPIs)", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    expect(byId.cobertura.sparkline).toEqual([10, 14]);
    expect(byId.mordeduras.sparkline).toEqual([3, 5]);
    expect(byId.zoonosis.sparkline).toEqual([1, 2]);
    // Non-window-sensitive KPIs never get a sparkline (no matching trend).
    expect(byId.esterilizacion.sparkline).toBeUndefined();
    expect(byId.perdidas.sparkline).toBeUndefined();
    expect(byId.denuncias.sparkline).toBeUndefined();

    // Parity: the trend fetchers receive the SAME ctx as the headline value —
    // the sparkline spans the active period, not a hardcoded 12m window.
    expect(fetchRabiesVaccinationTrend).toHaveBeenCalledTimes(1);
    expect(fetchBitesTrend).toHaveBeenCalledTimes(1);
    expect(fetchKpiTrend).toHaveBeenCalledWith("rabies_observation_started", expect.anything());
  });

  // ---------------------------------------------------------------------------
  // v+1 rail — meta-progress meters (item 2): reunificacion (D4) + microchip (C1)
  // render a `bar` + `tone` computed via toneForTarget against TARGETS, reusing
  // the SAME fetchers /gob/perdidas + /gob/programa already call.
  // ---------------------------------------------------------------------------

  it("reunificacion KPI carries a target-progress bar + tone vs TARGETS.REUNIFICATION_PCT", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const reunificacion = kpis.find((k) => k.id === "reunificacion")!;

    expect(reunificacion.value).toBe("45,2%");
    expect(reunificacion.bar).toBe(45.2);
    expect(reunificacion.tone).toBe("ok"); // 45.2 >= TARGETS.REUNIFICATION_PCT (39)
    expect(reunificacion.sub).toBe("meta 39% · 19 de 42 episodios");
    expect(reunificacion.href).toBe("/gob/perdidas");
    expect(fetchReunificationRate).toHaveBeenCalledTimes(1);
  });

  it("microchip KPI carries a target-progress bar + tone vs TARGETS.MICROCHIP_PENETRATION_PCT", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const microchip = kpis.find((k) => k.id === "microchip")!;

    expect(microchip.value).toBe("55,1%");
    expect(microchip.bar).toBe(55.1);
    expect(microchip.tone).toBe("warn"); // 55.1 < 80, but >= 80*0.5
    expect(microchip.sub).toBe("meta 80%");
    expect(microchip.href).toBe("/gob/censo");
    expect(fetchMicrochipPenetration).toHaveBeenCalledTimes(1);
  });

  it("reunificacion tone degrades to warn/danger below target, matching toneForTarget", async () => {
    vi.mocked(fetchReunificationRate).mockResolvedValue({
      ratePct: 5,
      recovered: 1,
      lostEpisodes: 20,
      medianDaysToRecovery: 10,
    });
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const reunificacion = kpis.find((k) => k.id === "reunificacion")!;
    expect(reunificacion.tone).toBe("danger"); // 5 < 39*0.5
  });

  // ---------------------------------------------------------------------------
  // NEVER-CRASH FAN-OUT (task #74): a failing fetcher must throw a typed error
  // WITHOUT abandoning its siblings (the source of the prod unhandledRejection).
  // ---------------------------------------------------------------------------

  it("throws PanoramaKpisUnavailableError when a fetcher rejects (does not build a partial strip)", async () => {
    vi.mocked(fetchBitesPer10k).mockRejectedValue(new Error("pooler timeout"));
    await expect(getPanoramaKpis({ role: "admin" }, [], period)).rejects.toBeInstanceOf(
      PanoramaKpisUnavailableError,
    );
  });

  it("awaits EVERY fetcher (allSettled) even when one rejects — no abandoned/dangling promise", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      // One fetcher rejects immediately; a sibling rejects a tick LATER. With
      // Promise.all the late sibling would be abandoned → unhandledRejection.
      // With allSettled both are awaited before we throw, so nothing dangles.
      vi.mocked(fetchRabiesCoverage).mockRejectedValue(new Error("first"));
      vi.mocked(fetchActiveZoonosis).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error("late sibling")), 20)),
      );

      await expect(getPanoramaKpis({ role: "admin" }, [], period)).rejects.toBeInstanceOf(
        PanoramaKpisUnavailableError,
      );

      // Give the late sibling time to reject and flush microtasks.
      await new Promise((r) => setTimeout(r, 60));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("degradedPanoramaKpis is an empty, honest strip", () => {
    const degraded = degradedPanoramaKpis();
    expect(degraded.kpis).toEqual([]);
    expect(degraded.dataAsOf).toBeNull();
    expect(degraded.coverageDenominator).toBeNull();
    expect(degraded.recalculatedFor.toLowerCase()).toContain("reintent");
  });
});
