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
    rate: 65.7,
    sterilized: 657,
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
    // Legal-analysis reorientation (2026-07-03): the two legally-grounded
    // compliance coverages lead; the population denominator closes the strip.
    expect(kpis.map((k) => k.id)).toEqual([
      "cobertura",
      "esterilizacion",
      "perdidas",
      "mordeduras",
      "zoonosis",
      "denuncias",
      "mascotas",
    ]);
    // Parity proof: every KPI names the fetcher that produced it.
    expect(kpis.map((k) => k.source)).toEqual([
      "govt-home-kpis.fetchRabiesCoverage",
      "metrics.fetchSterilizationCoverage",
      "govt-dashboards.fetchPerdidasMetrics",
      "govt-home-kpis.fetchBitesPer10k",
      "govt-home-kpis.fetchActiveZoonosis",
      "govt-home-kpis.fetchOpenWelfareReportsCount",
      "govt-dashboards.fetchAnalyticsMetrics",
    ]);
  });

  it("formats values with es-AR conventions and surfaces an info tooltip per KPI", async () => {
    const { kpis } = await getPanoramaKpis({ role: "admin" }, [], period);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    // Percentage — one decimal, es-AR comma (72.4 → "72,4%").
    expect(byId.cobertura.value).toBe("72,4%");
    expect(byId.cobertura.bar).toBe(72.4);
    expect(byId.cobertura.tone).toBe("warn"); // 72.4 < target 80

    // Thousands separator (es-AR) — 12345 → "12.345".
    expect(byId.mascotas.value).toBe((12345).toLocaleString("es-AR"));
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
  // task #78 Part 3 — the ministry "both numbers": total coverage as the headline,
  // firmado-por-matrícula share in the sub, via a SECOND verifiedOnly ctx.
  // ---------------------------------------------------------------------------

  it("computes a signed-only (verifiedOnly) coverage and surfaces it in the cobertura sub", async () => {
    vi.mocked(fetchRabiesCoverage)
      .mockResolvedValueOnce({ current: 41.3, target: 80, partidos: 12, hasData: true }) // total ctx
      .mockResolvedValueOnce({ current: 39, target: 80, partidos: 12, hasData: true }) // prior ctx
      .mockResolvedValueOnce({ current: 28.9, target: 80, partidos: 12, hasData: true }); // verified ctx

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

  it("surfaces the freshness timestamp as an ISO string (null-safe)", async () => {
    const result = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(result.dataAsOf).toBe("2026-06-19T18:30:00.000Z");

    vi.mocked(lastIngestAt).mockResolvedValue(null);
    const empty = await getPanoramaKpis({ role: "admin" }, [], period);
    expect(empty.dataAsOf).toBeNull();
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
    expect(degraded.recalculatedFor.toLowerCase()).toContain("reintent");
  });
});
