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

import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { localityByName } from "@/lib/ar-localidades";
import { provinceByCode } from "@/lib/ar-provincias";
import type { ProvinceCode } from "@/lib/ar-provincias";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { getJurisdictionsCached, getProfileCached } from "@/lib/request-cache";
import { createClient } from "@/lib/supabase/server";
import { getPanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 1. Non-redirect auth: admin or govt only.
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

  // 2. Parse period + scope from the query string (same keys as the dashboards).
  const url = new URL(request.url);
  const period = resolveAnalyticsPeriod({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const provinceIso = url.searchParams.get("province");
  const localitySlug = url.searchParams.get("locality");

  // 3. Intersect scope with the viewer's assignments (never widens for govt).
  let scoped = jurisdictions;
  if (provinceIso && profile.role !== "admin") {
    const provinceObj = provinceByCode(provinceIso);
    if (provinceObj) {
      const provinceName = provinceObj.name;
      const localityRow = localitySlug
        ? await localityByName(provinceObj.code as ProvinceCode, localitySlug)
        : null;
      scoped = localityRow
        ? jurisdictions.filter(
            (j) => j.province === provinceName && j.locality === localityRow.localityName,
          )
        : jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  // 4. Delegate to the use-case (reuses the tested dashboard fetchers).
  const result = await getPanoramaKpis(actor, scoped, period);

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
