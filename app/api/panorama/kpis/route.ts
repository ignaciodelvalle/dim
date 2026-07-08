// Read-only GET /api/panorama/kpis — the console's headline KPI strip.
//
// Used when the KPIs refetch on a client-side filter change (the page can also
// server-render the initial KPIs). Auth + scope intersection MIRROR the sibling
// /api/panorama/[layer]/route.ts EXACTLY:
//   - non-redirect session check (an API route answers with a status code, not
//     a redirect): 401 when unauthenticated, 403 when not admin/govt,
//   - scope is parsed from the query string (province/locality/period/from/to,
//     same keys as the dashboards) and INTERSECTED with the viewer's actual
//     assignments — a govt user can NEVER widen scope by crafting params.
//
// The KPI numbers come from getPanoramaKpis, which reuses the tested dashboard
// fetchers — the console can never desync from the detail dashboards.

import { NextResponse } from "next/server";

import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { narrowGovtScope } from "@/lib/domain/jurisdiction-canonical";
import { localityByName } from "@/lib/infra/ar-localidades";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";
import {
  degradedPanoramaKpis,
  getPanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { getCachedPanoramaKpis, kpiCacheKey } from "@/src/modules/panorama/application/kpis-cache";

import { resolveInstitutionalPanoramaActor } from "../_guard";

export const dynamic = "force-dynamic";

// Client-side budget for the KPI fan-out. The fan-out runs on the ANALYTICS
// pool (session pooler — measured ~1.7s for the worst case: universal scope,
// 3y window), so 20s is generous headroom, ABOVE the 15s DB statement_timeout:
// a genuinely stuck query is cancelled server-side first (SQLSTATE 57014 →
// rejection → 503 envelope below) and only a pathology the DB can't cancel
// falls through to the budget's degraded 200. Well below the lambda ceiling so
// the response is never truncated.
const KPIS_BUDGET_MS = 20_000;

export async function GET(request: Request) {
  // 1. Non-redirect auth: ACTIVE INSTITUTIONAL admin or govt only (same full
  //    invariant set as the page guard — role + account_type + deactivation +
  //    erasure). Personal-account 'admin', deactivated, and erased operators get
  //    401/403, never data. See _guard.ts.
  const auth = await resolveInstitutionalPanoramaActor();
  if (!auth.ok) return auth.response;
  const { profile, role } = auth.actor;

  const actor = { role };
  const jurisdictions: DashboardJurisdiction[] = auth.actor.jurisdictions;

  // 2. Parse period + scope from the query string (same keys as the dashboards).
  const url = new URL(request.url);
  const period = resolveAnalyticsPeriod({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const provinceIso = url.searchParams.get("province");
  const localitySlug = url.searchParams.get("locality");

  // Resolve the selected province/locality once — shared by govt scope-narrowing
  // and admin drill-down below (mirrors /api/panorama/[layer]).
  const provinceObj = provinceIso ? provinceByCode(provinceIso) : null;
  const localityRow =
    provinceObj && localitySlug
      ? await localityByName(provinceObj.code as ProvinceCode, localitySlug)
      : null;

  // 3. Intersect scope with the viewer's assignments (never widens for govt).
  // narrowGovtScope applies whole-province SUBSUMPTION: a whole-province
  // assignment narrows to the selected locality instead of being emptied by an
  // exact-locality mismatch (critique of PR #762, finding 4).
  const scoped =
    provinceObj && profile.role !== "admin"
      ? narrowGovtScope(jurisdictions, provinceObj.name, localityRow?.localityName ?? null)
      : jurisdictions;

  // Admin drill-down: mirror /api/panorama/[layer] and app/admin/panorama/page.tsx
  // so a client KPI refetch on a filter change scopes to the selected
  // province/locality. Without this the route ignored the admin filter and a
  // refetch silently returned NATIONAL KPIs (critique of PR #762, finding 1).
  // Only passed for admin — govt scope lives in `scoped`.
  const adminProvince = profile.role === "admin" ? (provinceObj?.name ?? undefined) : undefined;
  const adminLocality =
    profile.role === "admin" ? (localityRow?.localityName ?? undefined) : undefined;

  // 5. Short-TTL server cache (60s) keyed by the FULL authorization scope, so a
  //    burst of reloads on the warm-cold micro DB collapses onto ONE fan-out per
  //    scope instead of tripping the 20s budget on ~1 of 3 reloads (overnight QA).
  //    The key composes role + the sorted jurisdiction set + the resolved period
  //    window + the admin drill-down — two operators with different scopes can
  //    NEVER share an entry (see kpis-cache.ts + its scope-isolation test).
  //    Degraded results (empty strip from budget exhaustion) are NOT cached, so
  //    one bad load never poisons the next 60s. The withDbBudget wrapping is kept
  //    verbatim INSIDE the cache's compute() — the cache only memoizes SUCCESS.
  //
  //    Note: the SERVER page path (app/{admin,gob}/panorama/page.tsx) is left
  //    UNCACHED on purpose — first-paint freshness matters more there and it
  //    already carries its own withDbBudget. Sharing this per-request Map across
  //    the RSC render would also demand threading the same scope key through the
  //    page guard; not worth it for the first paint. The client refetch (this
  //    route), which is what reloads hammer, is where the cache earns its keep.
  const cacheKey = kpiCacheKey({
    role,
    jurisdictions: scoped,
    since: period.since,
    until: period.until,
    adminProvince,
    adminLocality,
  });

  // 6. Delegate to the use-case (reuses the tested dashboard fetchers), bounded
  //    by a time budget and wrapped so it NEVER throws to the runtime (task #74):
  //    - budget elapses (DB degraded / queries hang) → 200 with a degraded strip.
  //    - fetcher rejected (getPanoramaKpis throws) → 503 JSON error envelope.
  //    Either way the lambda answers cleanly instead of crashing mid-response.
  try {
    const { value: result, cacheHit } = await getCachedPanoramaKpis(
      cacheKey,
      () =>
        withDbBudget(
          getPanoramaKpis(actor, scoped, period, adminProvince, adminLocality),
          KPIS_BUDGET_MS,
          "GET /api/panorama/kpis",
          degradedPanoramaKpis(),
        ),
      // Only cache a successful computation. A degraded strip carries no tiles
      // (kpis: []); caching it would freeze the honest error for 60s.
      { shouldCache: (value) => value.kpis.length > 0 },
    );
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store", "x-kpi-cache": cacheHit ? "hit" : "miss" },
    });
  } catch (err) {
    console.error("[GET /api/panorama/kpis] failed:", err);
    return NextResponse.json(
      { error: "panorama_kpis_unavailable", ...degradedPanoramaKpis() },
      { status: 503, headers: { "cache-control": "no-store", "x-kpi-cache": "miss" } },
    );
  }
}
