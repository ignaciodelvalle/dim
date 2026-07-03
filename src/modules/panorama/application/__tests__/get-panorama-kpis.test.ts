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

import { getPanoramaKpis } from "../get-panorama-kpis";

const period: AnalyticsPeriod = {
  since: new Date("2025-06-20T00:00:00.000Z"),
  until: new Date("2026-06-20T00:00:00.000Z"),
};

function seedDefaults() {
  vi.mocked(fetchRabiesCoverage).mockResolvedValue({
    current: 72,
    target: 80,
    partidos: 3,
    hasData: true,
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
  vi.mocked(fetchOpenWelfareReportsCount).mockResolvedValue({ count: 4 });
  vi.mocked(fetchSterilizationCoverage).mockResolvedValue({
    rate: 65,
    sterilized: 650,
    total: 1000,
    byProvince: [],
  });
  vi.mocked(lastIngestAt).mockResolvedValue(new Date("2026-06-19T18:30:00.000Z"));
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDefaults();
});

describe("getPanoramaKpis", () => {
  it("returns 7 KPIs in display order, each backed by a named dashboard fetcher", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(kpis.map((k) => k.id)).toEqual([
      "cobertura",
      "mascotas",
      "perdidas",
      "mordeduras",
      "zoonosis",
      "denuncias",
      "esterilizacion",
    ]);
    // Parity proof: every KPI names the fetcher that produced it.
    expect(kpis.map((k) => k.source)).toEqual([
      "govt-home-kpis.fetchRabiesCoverage",
      "govt-dashboards.fetchAnalyticsMetrics",
      "govt-dashboards.fetchPerdidasMetrics",
      "govt-home-kpis.fetchBitesPer10k",
      "govt-home-kpis.fetchActiveZoonosis",
      "govt-home-kpis.fetchOpenWelfareReportsCount",
      "metrics.fetchSterilizationCoverage",
    ]);
  });

  it("formats values with es-AR conventions and surfaces an info tooltip per KPI", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    expect(byId.cobertura.value).toBe("72%");
    expect(byId.cobertura.bar).toBe(72);
    expect(byId.cobertura.tone).toBe("warn"); // 72 < target 80

    // Thousands separator (es-AR) — 12345 → "12.345".
    expect(byId.mascotas.value).toBe((12345).toLocaleString("es-AR"));
    // Decimal comma (es-AR) — 3.5 → "3,5".
    expect(byId.mordeduras.value).toBe("3,5");
    expect(byId.perdidas.value).toBe("42");
    expect(byId.zoonosis.value).toBe("9");
    expect(byId.denuncias.value).toBe("4");

    // esterilizacion KPI
    expect(byId.esterilizacion.value).toBe("65%");
    expect(byId.esterilizacion.bar).toBe(65);
    expect(byId.esterilizacion.tone).toBe("warn"); // 65 < target 70
    expect(byId.esterilizacion.sub).toBe("meta 70%");

    // Every KPI carries a non-empty info tooltip (the ⓘ definition).
    for (const k of kpis) {
      expect(k.info.definition.length).toBeGreaterThan(0);
      expect(k.href.startsWith("/gob/")).toBe(true);
    }
  });

  it("esterilizacion KPI is tone ok when rate >= 70", async () => {
    vi.mocked(fetchSterilizationCoverage).mockResolvedValue({
      rate: 75,
      sterilized: 750,
      total: 1000,
      byProvince: [],
    });
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const kpi = kpis.find((k) => k.id === "esterilizacion")!;
    expect(kpi.tone).toBe("ok");
    expect(kpi.value).toBe("75%");
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

  it("uses a neutral tone when there is nothing to flag (zero counts)", async () => {
    vi.mocked(fetchActiveZoonosis).mockResolvedValue({
      count: 0,
      rabies: 0,
      lepto: 0,
      hidat: 0,
      deltaWeek: 0,
    });
    vi.mocked(fetchOpenWelfareReportsCount).mockResolvedValue({ count: 0 });
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
      .mockResolvedValueOnce({ current: 72, target: 80, partidos: 3, hasData: true })
      .mockResolvedValueOnce({ current: 60, target: 80, partidos: 3, hasData: true });
    vi.mocked(fetchBitesPer10k)
      .mockResolvedValueOnce({ rate: 3.5, delta: 0, reports: 18 })
      .mockResolvedValueOnce({ rate: 7, delta: 0, reports: 30 });

    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    // cobertura: 72 vs 60 → +20%, up, es-AR signed label.
    expect(byId.cobertura.delta).toEqual({
      pct: 20,
      direction: "up",
      label: "+20% vs período anterior",
    });
    // mordeduras: 3.5 vs 7 → -50%, down.
    expect(byId.mordeduras.delta?.pct).toBe(-50);
    expect(byId.mordeduras.delta?.direction).toBe("down");
    // zoonosis: same mock both runs → 0%, flat (still meaningful: window metric).
    expect(byId.zoonosis.delta?.direction).toBe("flat");

    // State metrics NEVER carry a delta (no misleading 0% on stocks/queues).
    expect(byId.mascotas.delta).toBeUndefined();
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

    expect(fetchRabiesCoverage).toHaveBeenCalledTimes(2);
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

  it("surfaces the freshness timestamp as an ISO string (null-safe)", async () => {
    const result = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(result.dataAsOf).toBe("2026-06-19T18:30:00.000Z");

    vi.mocked(lastIngestAt).mockResolvedValue(null);
    const empty = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(empty.dataAsOf).toBeNull();
  });
});
