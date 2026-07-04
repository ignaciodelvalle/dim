// Read-only GET /api/panorama/[layer] — the LayerPanel fetches this on toggle.
//
// Auth: admin or govt ONLY. Unlike the page guards (which REDIRECT), an API
// route must answer with a status code, so we do a non-redirect session check
// (createClient + getProfileCached) and return 401/403 via NextResponse.
//
// Scope/period are parsed from the query string (same keys as the dashboards:
// province/locality/period/from/to) and intersected with the viewer's actual
// assignments — a govt user can NEVER widen scope by crafting params. The
// use-case enforces the per-layer cap + k-anon; we echo its envelope.

import { NextResponse } from "next/server";

import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { localityByName } from "@/lib/infra/ar-localidades";
import { getJurisdictionsCached, getProfileCached } from "@/lib/infra/request-cache";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { createClient } from "@/lib/supabase/server";
import { getLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { isLayerId } from "@/src/modules/panorama/domain/layers";
import { clampAsOf, parseAsOf } from "@/src/modules/panorama/domain/time-scrub";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ layer: string }> }) {
  const { layer } = await ctx.params;

  // 1. Validate the layer id (registry type guard).
  if (!isLayerId(layer)) {
    return NextResponse.json({ error: "unknown_layer" }, { status: 404 });
  }

  // 2. Non-redirect auth: admin or govt only.
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

  // 3. Parse period + scope from the query string.
  const url = new URL(request.url);
  const sp = {
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
  const { since, until } = resolveAnalyticsPeriod(sp);

  // F4 temporal reproduction: parse an optional `asOf` ISO upper bound and clamp
  // it into [since, until] (until = "now" for presets) so a crafted param can
  // never widen the window below `since` or above the live edge. null = live.
  const asOf = clampAsOf(parseAsOf(url.searchParams.get("asOf")), since, until) ?? undefined;

  const provinceIso = url.searchParams.get("province");
  const localitySlug = url.searchParams.get("locality");

  // U5 aggregation axis (distinct from the province/locality SCOPE filter above):
  // `level=province` aggregates the choropleth layers by province (filled
  // polygons); anything else defaults to locality (centroid symbols). A crafted
  // value can only choose between the two safe levels — never widen scope.
  const level = url.searchParams.get("level") === "province" ? "province" : "locality";

  // Resolve the selected province/locality once — shared by govt scope-narrowing
  // and admin drill-down below.
  const provinceObj = provinceIso ? provinceByCode(provinceIso) : null;
  const localityRow =
    provinceObj && localitySlug
      ? await localityByName(provinceObj.code as ProvinceCode, localitySlug)
      : null;

  // 4. Intersect scope with the viewer's assignments (never widens for govt).
  let scoped = jurisdictions;
  if (provinceObj && profile.role !== "admin") {
    scoped = localityRow
      ? jurisdictions.filter(
          (j) => j.province === provinceObj.name && j.locality === localityRow.localityName,
        )
      : jurisdictions.filter((j) => j.province === provinceObj.name);
  }

  // Admin drill-down: mirror app/admin/panorama/page.tsx so toggled layers scope
  // to the selected province/locality exactly like the server-rendered default
  // layer + KPIs. Without this the API ignored the filter for admins and every
  // toggled layer returned national data while the default layer showed the
  // selected province. Only passed for admin — govt scope lives in `scoped`.
  const adminProvince = profile.role === "admin" ? (provinceObj?.name ?? undefined) : undefined;
  const adminLocality =
    profile.role === "admin" ? (localityRow?.localityName ?? undefined) : undefined;

  // 5. Delegate to the use-case (cap + k-anon enforced inside). The level only
  // affects the two choropleth layers; point layers ignore it.
  const result = await getLayerFeatures(
    layer,
    actor,
    scoped,
    { since, asOf },
    level,
    adminProvince,
    adminLocality,
  );

  return NextResponse.json(
    {
      features: result.features,
      truncated: result.truncated,
      suppressedCount: result.suppressedCount,
      noLocalityCount: result.noLocalityCount ?? 0,
      level: result.level,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
