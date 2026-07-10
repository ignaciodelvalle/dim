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
import { narrowGovtScope } from "@/lib/domain/jurisdiction-canonical";
import { localityByName } from "@/lib/infra/ar-localidades";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";
import {
  emptyLayerFeatures,
  resolvePointsMode,
} from "@/src/modules/panorama/application/get-layer-features";
import { loadLayerFeaturesCachedWithMeta } from "@/src/modules/panorama/application/load-layer-features-cached";
import { isLayerId } from "@/src/modules/panorama/domain/layers";
import { clampAsOf, parseAsOf, parseTimeBasis } from "@/src/modules/panorama/domain/time-scrub";

import { resolveInstitutionalPanoramaActor } from "../_guard";

export const dynamic = "force-dynamic";

// Client-side budget for a single layer fetch — see kpis/route.ts for the
// rationale. On expiry the route returns an empty FeatureCollection (200).
const LAYER_BUDGET_MS = 8000;

export async function GET(request: Request, ctx: { params: Promise<{ layer: string }> }) {
  const { layer } = await ctx.params;

  // 1. Validate the layer id (registry type guard).
  if (!isLayerId(layer)) {
    return NextResponse.json({ error: "unknown_layer" }, { status: 404 });
  }

  // 2. Non-redirect auth: ACTIVE INSTITUTIONAL admin or govt only. This routes
  //    through the same full invariant set as the page guard (role +
  //    account_type + deactivation + erasure) — a personal-account 'admin', a
  //    deactivated or an erased operator gets 401/403, never data. See _guard.ts.
  const auth = await resolveInstitutionalPanoramaActor();
  if (!auth.ok) return auth.response;
  const { profile, role } = auth.actor;

  const actor = { role };
  const jurisdictions: DashboardJurisdiction[] = auth.actor.jurisdictions;

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

  // task #77 bitemporal: replay basis. "valid" (occurred_at, default) reproduces
  // "what happened when"; "transaction" (recorded_at) reproduces "what the State
  // KNEW when". Honored by the pet_events-backed layers; a crafted value can only
  // pick between the two safe modes — it never widens scope, k-anon or auth.
  const basis = parseTimeBasis(url.searchParams.get("basis"));

  const provinceIso = url.searchParams.get("province");
  const localitySlug = url.searchParams.get("locality");

  // U5 aggregation axis (distinct from the province/locality SCOPE filter above):
  // `level=province` aggregates the choropleth layers by province (filled
  // polygons); anything else defaults to locality (centroid symbols). A crafted
  // value can only choose between the two safe levels — never widen scope.
  const level = url.searchParams.get("level") === "province" ? "province" : "locality";

  // task #78 Part 3: the "solo firmado por matrícula" toggle. A crafted `?verified=1`
  // can ONLY narrow the rabies-coverage numerator to vet-signed doses — it never
  // widens scope, k-anon or auth (all enforced below/inside the loader). Honored by
  // the `cobertura` layer only; every other layer ignores it.
  const verifiedOnly = url.searchParams.get("verified") === "1";

  // Resolve the selected province/locality once — shared by govt scope-narrowing
  // and admin drill-down below.
  const provinceObj = provinceIso ? provinceByCode(provinceIso) : null;
  const localityRow =
    provinceObj && localitySlug
      ? await localityByName(provinceObj.code as ProvinceCode, localitySlug)
      : null;

  // 4. Intersect scope with the viewer's assignments (never widens for govt).
  // narrowGovtScope applies whole-province SUBSUMPTION: a whole-province
  // assignment narrows to the selected locality instead of being emptied by an
  // exact-locality mismatch (critique of PR #762, finding 4).
  const scoped =
    provinceObj && profile.role !== "admin"
      ? narrowGovtScope(jurisdictions, provinceObj.name, localityRow?.localityName ?? null)
      : jurisdictions;

  // Admin drill-down: mirror app/admin/panorama/page.tsx so toggled layers scope
  // to the selected province/locality exactly like the server-rendered default
  // layer + KPIs. Without this the API ignored the filter for admins and every
  // toggled layer returned national data while the default layer showed the
  // selected province. Only passed for admin — govt scope lives in `scoped`.
  const adminProvince = profile.role === "admin" ? (provinceObj?.name ?? undefined) : undefined;
  const adminLocality =
    profile.role === "admin" ? (localityRow?.localityName ?? undefined) : undefined;

  // panorama-event-points Slice 1 — SERVER-AUTHORITATIVE points-mode gate (A1).
  // The client sends `mode=points` when zoomed into a jurisdiction, but the
  // server independently requires a province to be RESOLVED (provinceObj != null,
  // for admin AND govt alike). Govt stays additionally bound by petsScope inside
  // the loader. A crafted `?mode=points` with no province → false → aggregated
  // bubbles, never a national dump of every lost-pet coordinate.
  const pointsMode = resolvePointsMode(url.searchParams.get("mode"), provinceObj != null);

  // 5. Delegate to the use-case (cap + k-anon enforced inside). The level only
  // affects the two choropleth layers; point layers ignore it. Bounded + never
  // throws to the runtime (task #74): budget expiry → empty features (200);
  // fetcher rejection → 503 JSON envelope. Never crashes the lambda.
  // The layer window's upper bound: an explicit `asOf` scrub if present, else the
  // period's own `until`. Passing only `asOf` (undefined when not scrubbing) let
  // a CUSTOM period's upper bound leak — events after `to` were plotted (critique
  // of PR #762, finding 3). getLayerFeatures already treats `asOf` as the upper
  // bound of the event-windowed layers and ignores it for current-state layers,
  // so `asOf ?? until` bounds custom periods without touching the loader signature.
  const windowUntil = asOf ?? until;

  try {
    const { result, status } = await withDbBudget(
      // Cross-request Data Cache stays INSIDE the budget so a degraded/empty
      // fallback is never cached; points mode bypasses the cache internally.
      // The meta variant reports how the result was served (hit|miss|bypass) so
      // we can echo an `x-layer-cache` header mirroring the KPI route's
      // `x-kpi-cache`. On a budget timeout the fallback reads as "miss" (a
      // degraded/empty result was NOT served from the cache).
      loadLayerFeaturesCachedWithMeta(
        layer,
        actor,
        scoped,
        { since, asOf: windowUntil, basis },
        level,
        adminProvince,
        adminLocality,
        pointsMode,
        verifiedOnly,
      ),
      LAYER_BUDGET_MS,
      `GET /api/panorama/${layer}`,
      { result: emptyLayerFeatures(), status: pointsMode ? "bypass" : "miss" },
    );

    return NextResponse.json(
      {
        features: result.features,
        truncated: result.truncated,
        suppressedCount: result.suppressedCount,
        noLocalityCount: result.noLocalityCount ?? 0,
        level: result.level,
        // panorama-event-points Slice 1: points-mode envelope (undefined for the
        // aggregated path — the console falls back to its aggregated disclosure).
        mode: result.mode,
        sinUbicacionCount: result.sinUbicacionCount ?? 0,
      },
      { headers: { "cache-control": "no-store", "x-layer-cache": status } },
    );
  } catch (err) {
    console.error(`[GET /api/panorama/${layer}] failed:`, err);
    return NextResponse.json(
      { error: "panorama_layer_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-layer-cache": "miss" } },
    );
  }
}
