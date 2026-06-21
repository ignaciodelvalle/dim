// GET /api/panorama/unit-history — F4 on-demand unit history for the DetailDrawer.
//
// Returns the catalogued history for a SINGLE administrative unit (province or
// province+locality) for the active layer and period: recent events, daily trend
// (for the sparkline), and a count breakdown by event sub-type.
//
// Auth: admin or govt ONLY — same non-redirect pattern as /api/panorama/[layer].
// A govt actor can NEVER query a unit outside its assigned jurisdictions (the
// repository enforces a second-fence check; this route enforces the first).
//
// Required query params:
//   layer    — a valid LayerId (checked via isLayerId)
//   province — province display name (e.g. "Buenos Aires")
//
// Optional query params:
//   locality — locality display name
//   period   — preset key or "custom" (default: 30d)
//   from/to  — ISO date strings for custom range
//   asOf     — ISO datetime for temporal reproduction (clamped to [since, until])
//
// Response: { events, trend, byType } — shape defined by UnitHistoryResult.
// Errors:   400 missing params / 401 unauthenticated / 403 forbidden scope.

import { NextResponse } from "next/server";

import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { getJurisdictionsCached, getProfileCached } from "@/lib/request-cache";
import { createClient } from "@/lib/supabase/server";
import { isLayerId } from "@/src/modules/panorama/domain/layers";
import { clampAsOf, parseAsOf } from "@/src/modules/panorama/domain/time-scrub";
import { loadUnitHistory } from "@/src/modules/panorama/infrastructure/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // 1. Parse and validate required params.
  const layer = url.searchParams.get("layer") ?? "";
  const province = url.searchParams.get("province") ?? "";

  if (!isLayerId(layer)) {
    return NextResponse.json({ error: "unknown_layer" }, { status: 400 });
  }
  if (!province) {
    return NextResponse.json({ error: "missing_province" }, { status: 400 });
  }

  const locality = url.searchParams.get("locality") ?? undefined;

  // 2. Non-redirect auth: admin or govt only (mirrors /api/panorama/[layer]).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const profile = await getProfileCached(user.id);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const actor = { role: profile.role as "admin" | "govt" };
  const jurisdictions: DashboardJurisdiction[] =
    profile.role === "govt" ? await getJurisdictionsCached(profile.id) : [];

  // 3. Scope gate for govt actors: the requested unit must be within their
  //    assignments. Reject with 403 rather than returning empty data — the
  //    client should never request out-of-scope units (the map only shows
  //    features within scope), so a 403 here means a crafted request.
  if (actor.role === "govt") {
    const inScope = jurisdictions.some((j) => {
      if (j.province !== province) return false;
      if (locality) return j.locality === locality;
      return true;
    });
    if (!inScope) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // 4. Parse period + optional asOf (same pattern as /api/panorama/[layer]).
  const sp = {
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
  const { since, until } = resolveAnalyticsPeriod(sp);
  const asOf = clampAsOf(parseAsOf(url.searchParams.get("asOf")), since, until) ?? undefined;

  // 5. Delegate to the repository. The repository enforces a second-fence scope
  //    check for govt actors and applies the same event predicates as the per-
  //    unit loaders (no wider scope possible through crafted params).
  const result = await loadUnitHistory({
    layer,
    province,
    locality: locality ?? null,
    since,
    until: asOf ?? until,
    actor,
    jurisdictions,
  });

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
