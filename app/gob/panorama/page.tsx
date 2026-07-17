import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  deriveWidestJurisdiction,
  isProvinceInGovtScope,
  resolveSeedLocalitySlug,
} from "@/app/gob/panorama/derive-widest-jurisdiction";
import { NoticeToast } from "@/components/gob/NoticeToast";
import { PanoramaBoardSkeleton } from "@/components/panorama/PanoramaBoardSkeleton";
import type { SeededLayer } from "@/components/panorama/PanoramaConsole";
import { PanoramaShell } from "@/components/panorama/PanoramaShell";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { GOB_ALL_PROVINCES } from "@/lib/analytics/govt-dashboards";
import { narrowGovtScope } from "@/lib/domain/jurisdiction-canonical";
import {
  listLocalitiesByProvince,
  listLocalityCentroids,
  localityByName,
} from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { jurisdictionBounds } from "@/lib/infra/gov-scope";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { panoramaScopeLabel } from "@/lib/panorama/scope-label";
import type { ProvinceCode } from "@/lib/reference/ar-provincias";
import { provinceByCode, provinceByName } from "@/lib/reference/ar-provincias";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";
import { emptyLayerFeatures } from "@/src/modules/panorama/application/get-layer-features";
import { degradedPanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { loadLayerFeaturesCubeOrCached } from "@/src/modules/panorama/application/load-layer-features-cube";
import { loadCachedPanoramaKpis } from "@/src/modules/panorama/application/load-panorama-kpis";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import {
  DEFAULT_PANORAMA_PRESET_ID,
  type PresetId,
  getPreset,
  presetLayerIds,
} from "@/src/modules/panorama/domain/presets";

// Centro de Situación Nacional — gobierno view (jurisdiction scope).
// govt sees only its assigned jurisdictions (intersection inherited from the
// scope-aware loaders); admin viewing /gob/* gets universal scope.
export const dynamic = "force-dynamic";

// Server-render budget for the concurrent fan-outs (task #74). On expiry (or a
// fetcher rejection, caught below) the page renders a degraded-but-honest state
// instead of hanging the RSC stream forever (the staging incident).
const PAGE_BUDGET_MS = 9000;

// scopeLabel now lives in lib/panorama/scope-label.ts (shared with /admin/panorama
// so both routes render the same honest scope string for a bounded operator).

// BUG FIX (widest-jurisdiction default): deriveWidestJurisdiction /
// resolveSeedLocalitySlug live in ./derive-widest-jurisdiction.ts, not here —
// a page.tsx may only export the framework's reserved names (`default`,
// `metadata`, `dynamic`, ...); the generated route type-check hard-fails on
// any other named export. See that module for the full contract + doc
// comments; unit-tested in __tests__/derive-widest-jurisdiction.test.ts.

type PanoramaSearchParams = Promise<{
  period?: string;
  from?: string;
  to?: string;
  province?: string;
  locality?: string;
  // perf plan 1.2: a first visit carries NONE of period/preset/layers (nor a
  // custom from/to window) — the signal to seed the role-default preset.
  preset?: string;
  layers?: string;
  // Round-2 review #5: the temporal-scrub cutoff from a "Copiar vista" deep link.
  asOf?: string;
}>;

// RESILIENCE (2026-07-10, PO instrumented-review finding #1): the board's slow
// default-layer seed used to be awaited at the TOP of this page component,
// blocking the very first byte for up to PAGE_BUDGET_MS while the generic
// route-group "Cargando…" skeleton hung. It now streams behind this <Suspense>
// so the outer function returns synchronously — the operator chrome + a bounded
// panorama skeleton paint immediately, and the seeded board flushes when ready.
// A throw inside the board is caught by app/gob/panorama/error.tsx (a real
// "reintentar" state), never a perpetual skeleton.
export default function GobPanoramaPage({
  searchParams,
}: {
  searchParams: PanoramaSearchParams;
}) {
  return (
    <>
      {/* G1: fires the "fuera de alcance" toast after an out-of-scope bounce. */}
      <NoticeToast />
      <Suspense fallback={<PanoramaBoardSkeleton />}>
        <GobPanoramaBoard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function GobPanoramaBoard({
  searchParams,
}: {
  searchParams: PanoramaSearchParams;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  // Q12: only a bounded-jurisdiction govt operator returns to "mi jurisdicción";
  // admin/universal (no assigned jurisdiction) returns to "Vista nacional".
  const boundedJurisdiction = profile.role !== "admin" && jurisdictions.length > 0;

  const sp = await searchParams;
  // Panorama defaults to a multi-year window (system "started" ~3 years ago) so
  // the map + scrubber span the seeded history. Detail dashboards are unchanged.
  const period = resolveAnalyticsPeriod({ ...sp, period: sp.period ?? PANORAMA_DEFAULT_PRESET });
  const { since } = period;

  // Round-2 review #5: seed the KPI strip AS-OF a deep-linked ?asOf so SSR never
  // paints live temporal KPIs over a scrubbed map. Unparseable → live.
  const asOfSeed = (() => {
    if (!sp.asOf) return null;
    const d = new Date(sp.asOf);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  const provinceObj = sp.province ? provinceByCode(sp.province) : null;

  // BUG FIX (widest-jurisdiction default): the operator's widest jurisdiction,
  // derived robustly from their assignments (see helper). Admin (no assignments)
  // and multi-province operators resolve to national. PRESENTATION-ONLY — this
  // seeds the client `initialDivision*` props, NEVER a server redirect to
  // ?province/?locality (that would re-enter narrowGovtScope and could loop with
  // the client mount-seed). The DATA scope stays enforced by the scoped loaders.
  const widest =
    profile.role !== "admin"
      ? deriveWidestJurisdiction(jurisdictions)
      : { provinceCode: null as string | null, localityName: null as string | null };

  // G1 (govt/public honesty): a GOVT operator who requests a ?province OUTSIDE
  // their jurisdiction must NOT be shown a hollow foreign-province shell (map +
  // caption naming a province they cannot act on, KPIs "—", a 500-locality
  // dropdown). Hard-refuse and BOUNCE to their widest in-scope jurisdiction with
  // an honest notice. ADMIN is universal → exempt (any province is valid).
  //
  // Loop-safety: the bounce target is derived from the operator's OWN assignments
  // (deriveWidestJurisdiction), so the re-entered request is always in scope and
  // re-passes this guard. A multi-province / no-scope operator (provinceCode null)
  // bounces to the bare panorama (implicit scope, no ?province) — which likewise
  // never re-triggers the guard. It is a presentation redirect, never a narrowing
  // loop with narrowGovtScope.
  if (profile.role !== "admin" && provinceObj) {
    if (!isProvinceInGovtScope(jurisdictions, provinceObj.code)) {
      const params = new URLSearchParams();
      if (widest.provinceCode) params.set("province", widest.provinceCode);
      // Preserve the operator's grain: a barrio-scoped govt operator must bounce
      // back to their barrio, not widen to the whole province/city. The locality
      // is seeded into initialDivisionLocality below via the sp.locality path.
      if (widest.localityName) params.set("locality", widest.localityName);
      params.set("notice", "fuera-de-alcance");
      redirect(`/gob/panorama?${params.toString()}`);
    }
  }

  // The province whose localities/centroids the console needs: an explicit URL
  // drill wins; otherwise the operator's implicit single-province jurisdiction so
  // a scoped operator's division outlines + locality autozoom resolve on mount.
  const scopeProvinceCode: ProvinceCode | null =
    (provinceObj?.code as ProvinceCode | undefined) ?? (widest.provinceCode as ProvinceCode | null);
  const [localities, localityCentroids] = scopeProvinceCode
    ? await Promise.all([
        listLocalitiesByProvince(scopeProvinceCode),
        listLocalityCentroids(scopeProvinceCode),
      ])
    : [[], {}];
  const localityRow =
    provinceObj && sp.locality
      ? await localityByName(provinceObj.code as ProvinceCode, sp.locality)
      : null;

  // BUG FIX: single-locality operator → resolve the locality NAME to its SLUG so
  // the console can seed `selectedLocalityCenter` (the console keys centroids by
  // slug) and autozoom to it on load. Only when the URL didn't already pin a
  // province (an explicit drill owns the view). Reuses the alias-tolerant
  // localityByName resolver, so the slug always matches the loaded centroid map.
  const seedLocalityRow =
    !provinceObj && widest.localityName && scopeProvinceCode
      ? await localityByName(scopeProvinceCode, widest.localityName)
      : null;
  // Seed the barrio/locality view whenever the URL names one — the implicit
  // widest-jurisdiction path above (no ?province) OR an explicit ?locality
  // (a manual drill, or the fuera-de-alcance bounce that now preserves the
  // operator's barrio). Without the localityRow fallback, a barrio-scoped govt
  // operator bounced back to scope widened to province/city grain.
  const initialDivisionLocality =
    resolveSeedLocalitySlug(seedLocalityRow) ?? resolveSeedLocalitySlug(localityRow);

  // Intersect the selected province/locality with the user's actual assignments
  // so a govt user cannot widen scope by crafting ?province=&locality= params.
  // narrowGovtScope applies whole-province SUBSUMPTION: a whole-province
  // assignment narrows to the selected locality instead of being emptied by an
  // exact-locality mismatch (critique of PR #762, finding 4).
  const scoped: DashboardJurisdiction[] =
    provinceObj && profile.role !== "admin"
      ? narrowGovtScope(jurisdictions, provinceObj.name, localityRow?.localityName ?? null)
      : jurisdictions;

  // Admin province drill-down: canonical stored names derived server-side from
  // provinceByCode() and localityByName(). Only passed for admin role — govt
  // actors must NOT receive these; their scope is enforced by filteredJurisdictions.
  const adminProvince = profile.role === "admin" ? (provinceObj?.name ?? undefined) : undefined;
  const adminLocality =
    profile.role === "admin" ? (localityRow?.localityName ?? undefined) : undefined;

  // allowedProvinces: admin → all 24; govt → derive from assigned jurisdictions.
  // Resolve each province code with the ALIAS-TOLERANT provinceByName (not the
  // alias-fragile PROVINCE_ISO_MAP, which lacked the CABA long-form key and could
  // empty the set — dropping a single-province operator to national). The display
  // name stays the operator's stored name for switcher continuity.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: provinceByName(name)?.code ?? "", name }))
          .filter((p) => p.code !== "");

  // Single-province govt scope: the operator's assignments all fall within ONE
  // province. Their scope is IMPLICIT (inherited from the session — they never
  // pick a province in the JurisdictionSwitcher), so `selectedProvinceCode`
  // stays null and the always-visible administrative divisions (barrios for
  // CABA, departamentos elsewhere) never render (PO validation 2026-07-07).
  // Derive the effective division province from the resolved allowedProvinces
  // (deduped by province) so the console activates that province's divisions on
  // mount, exactly as an explicit ?province selection would. Multi-province or
  // admin/national scope → undefined (provinces basemap until an explicit pick).
  // PRESENTATION-ONLY: the data scope is unchanged (scoped loaders enforce it).
  // Derived from the robust widest-jurisdiction resolution (provinceByName) so an
  // alias-form province name can never empty it and drop the operator to national.
  const initialDivisionProvince = widest.provinceCode ?? undefined;

  // Role-aware default vista (audit-ratified 2026-07-09): the first-visit preset
  // follows the operator's urgent question. A jurisdiction (govt) operator opens
  // on local syndromic surveillance ("sintomas" — base síntomas density + señal
  // de zoonosis, locality-level, framing-less so it stays in THEIR jurisdiction),
  // the sanitary-surveillance question they act on; an admin viewing /gob keeps
  // the national overview default. Presentation-only — respects the URL ?preset
  // contract (applied only on a bare first visit; never overrides an explicit
  // board). The server-seeded default LAYER (perdidas) is unchanged; this only
  // steers the client's first-visit preset auto-activation.
  // Both roles now open on the same vista (PO 2026-07-16): `brotes-activos` in
  // its bivariate encoding. The govt-only "sintomas" default existed to keep a
  // barrio-scoped operator inside their own jurisdiction — but the map's framing
  // was always PRESENTATION-ONLY (the scoped loaders enforce the data), and the
  // operators this matters for are now regional, not barrio-bound. One default
  // also means the demo path and the operator path are the same screen.
  const defaultPresetId: PresetId = DEFAULT_PANORAMA_PRESET_ID;

  // biome-ignore lint/style/noNonNullAssertion: "perdidas" is a static registry id.
  const layer = getLayer("perdidas")!;

  // Govt → bbox of their assigned localities; admin (jurisdictions=[]) → null.
  // Cheap static lookup, needed by both the first-visit and normal paths.
  const initialBounds = await jurisdictionBounds(jurisdictions);

  // perf plan 1.2 — first-visit detection. A TRUE first visit carries none of
  // period/preset/layers (nor a custom from/to window): the bare-URL landing the
  // client would otherwise resolve to the role-default preset AFTER discarding a
  // freshly-seeded perdidas layer. On this path the server does that resolution
  // itself — seeding the preset's layers + KPIs at the PRESET's window/level —
  // so the client paints on first render with zero layer fetches.
  const isFirstVisit =
    sp.period === undefined &&
    sp.preset === undefined &&
    sp.layers === undefined &&
    sp.from === undefined &&
    sp.to === undefined;

  // The preset to seed server-side (its layers + window), or null to fall through
  // to the perdidas seed. Two paths land here:
  //  (1) a first visit → the role-default vista (perf plan 1.2);
  //  (2) an explicit `?preset=<id>` deep-link with NO `?layers=` override → THAT
  //      preset. Without this, a shared/embedded `?preset=sintomas` link
  //      disqualified itself from the first-visit gate (sp.preset !== undefined)
  //      and fell through to the orphan perdidas seed — the deep-link never
  //      painted its own board (pre-existing bug, not a P2 regression). An
  //      explicit `?layers=` still wins: a hand-built board is not a preset seed.
  const urlPreset =
    sp.layers === undefined && sp.preset !== undefined
      ? (getPreset(sp.preset as PresetId) ?? null)
      : null;
  // biome-ignore lint/style/noNonNullAssertion: defaultPresetId is a static registry id.
  const roleDefaultPreset = isFirstVisit ? getPreset(defaultPresetId)! : null;
  const seedPreset = urlPreset ?? roleDefaultPreset;

  if (seedPreset) {
    const preset = seedPreset;
    // CRITICAL C2 INVARIANT: seed AND initialLevel are BOTH `seedLevel`. The
    // console initializes `level` from initialLevel and reads each seeded layer
    // from the cache keyed by that level — a mismatch blanks the map.
    //
    // PO-ratified 2026-07-09: the seed level follows the SCOPE, not the preset.
    // A govt operator (always jurisdiction-scoped) or an explicit province opens
    // at LOCALITY (scope-wins); only the unscoped national (admin viewing /gob)
    // seeds at PROVINCE — matching the console's zoomed-out hysteresis derivation
    // so the mount produces no level drift/refetch. The preset's own `level` is
    // only a preference now.
    const isScoped = provinceObj !== null || (profile.role !== "admin" && jurisdictions.length > 0);
    const seedLevel = isScoped ? ("locality" as const) : ("province" as const);
    // The preset's OWN window (90d/30d) — not the 3y default. This also scopes
    // the KPI fan-out to that window, killing the wasted 3-year compute. A
    // `?preset=X&period=Y` deep-link honors its explicit window (`period`, already
    // resolved above from sp.period); a bare `?preset=X` uses the preset's window.
    const seedPeriod =
      urlPreset && sp.period !== undefined
        ? period
        : resolveAnalyticsPeriod({ period: preset.periodPreset });
    const seedIds = presetLayerIds(preset);
    // Streamed KPIs — NOT awaited here. `.catch` degrades an early rejection so
    // the promise always resolves to an honest strip (the loader carries its own
    // 20s budget; the console shows "Cargando indicadores…" until it lands).
    // RESILIENCE (2026-07-10): created BEFORE the seed await so the KPI fan-out
    // runs CONCURRENTLY with the seed instead of serializing after it — the two
    // slow paths overlap rather than summing.
    const kpisPromise = loadCachedPanoramaKpis({
      actor,
      jurisdictions: scoped,
      period: seedPeriod,
      adminProvince,
      adminLocality,
      asOf: asOfSeed,
      label: "gob/panorama kpis",
    })
      .then((r) => r.value)
      .catch(() => degradedPanoramaKpis());
    // perf plan 1.3: only the LAYER seed is awaited (fast at the preset's 90d
    // window) — it must paint on first render. The KPI fan-out is streamed
    // UN-awaited (kpisPromise above) so a cold ~12-query load never blocks the
    // SSR shell; the console resolves it client-side behind a pending strip.
    const seedResults = await Promise.all(
      seedIds.map((lid) =>
        withDbBudget(
          loadLayerFeaturesCubeOrCached(
            lid,
            actor,
            scoped,
            // Pass the window's UPPER bound (`asOf`) too, exactly like the layer
            // API route does (`windowUntil = asOf ?? until`). Omitting it (a) let
            // a custom `?from=&to=` window leak past its chosen `to`, and (b)
            // minted a DIFFERENT cache key than the API for the same logical
            // window (SSR asOf="" vs API asOf=bucketed) — halving cache reuse.
            { since: seedPeriod.since, asOf: seedPeriod.until },
            seedLevel,
            adminProvince,
            adminLocality,
          ),
          PAGE_BUDGET_MS,
          `gob/panorama seed ${lid}`,
          emptyLayerFeatures(),
        ).catch(() => emptyLayerFeatures()),
      ),
    );
    const seededLayers: SeededLayer[] = seedIds.map((lid, i) => ({
      id: lid,
      features: seedResults[i].features,
      truncated: seedResults[i].truncated,
      suppressedCount: seedResults[i].suppressedCount,
      noLocalityCount: seedResults[i].noLocalityCount,
    }));
    return (
      <PanoramaShell
        scopeLabel={panoramaScopeLabel(profile.role, jurisdictions)}
        boundedJurisdiction={boundedJurisdiction}
        layer={layer}
        // perdidas is NOT seeded on the first-visit path — the preset owns the
        // board. Pass an empty envelope so the console has a default (unused).
        features={emptyLayerFeatures().features}
        truncated={false}
        suppressedCount={0}
        allowedProvinces={allowedProvinces}
        localities={localities}
        localityCentroids={localityCentroids}
        kpisPromise={kpisPromise}
        initialBounds={initialBounds ?? undefined}
        initialLevel={seedLevel}
        initialDivisionProvince={initialDivisionProvince}
        initialDivisionLocality={initialDivisionLocality}
        defaultPresetId={defaultPresetId}
        seededPresetId={preset.id}
        seededLayers={seededLayers}
      />
    );
  }

  // Non-first visit — keep today's behavior (perdidas seed, now cache-warmed).
  //
  // Seed level follows the scope (QA 2026-07-03): a govt actor (always
  // jurisdiction-scoped) or an explicit province selection opens at LOCALITY
  // granularity — the finest the data supports; only the unscoped national
  // (admin) view stays at PROVINCE. The level MUST match PanoramaShell's
  // initialLevel or the console's seeded cache is the wrong one (C2).
  const isScoped = provinceObj !== null || (profile.role !== "admin" && jurisdictions.length > 0);
  const initialLevel = isScoped ? ("locality" as const) : ("province" as const);
  // KPIs go through the SHARED cached loader (staging QA 2026-07-08 #1): a
  // browser reload hits the warm 60s per-lambda cache instead of re-running the
  // ~12-query fan-out. perf plan 1.3: the promise is streamed UN-awaited so a
  // COLD fan-out (cache miss) never blocks the SSR shell — the console resolves
  // it client-side behind a "Cargando indicadores…" pending strip. The loader
  // carries its own 20s budget; the trailing `.catch` degrades an early rejection.
  // RESILIENCE (2026-07-10): created BEFORE the seed await so the KPI fan-out
  // runs CONCURRENTLY with the layer seed instead of serializing after it.
  const kpisPromise = loadCachedPanoramaKpis({
    actor,
    jurisdictions: scoped,
    period,
    adminProvince,
    adminLocality,
    asOf: asOfSeed,
    label: "gob/panorama kpis",
  })
    .then((r) => r.value)
    .catch(() => degradedPanoramaKpis());
  // perf plan 1.3: only the LAYER is awaited (fast at the active window) so the
  // map paints on first render. withDbBudget degrades on timeout and the
  // trailing `.catch` degrades on an early fetcher rejection — a degraded DB
  // never throws out of this Server Component.
  const result = await withDbBudget(
    loadLayerFeaturesCubeOrCached(
      "perdidas",
      actor,
      scoped,
      // Include the window's UPPER bound so a custom `?from=&to=` window honors
      // its chosen `to`, and the SSR cache key unifies with the layer API's
      // (both key on `asOf=bucket(until)` for the same logical window).
      { since, asOf: period.until },
      initialLevel,
      adminProvince,
      adminLocality,
    ),
    PAGE_BUDGET_MS,
    "gob/panorama layer",
    emptyLayerFeatures(),
  ).catch(() => emptyLayerFeatures());

  return (
    <PanoramaShell
      scopeLabel={panoramaScopeLabel(profile.role, jurisdictions)}
      boundedJurisdiction={boundedJurisdiction}
      layer={layer}
      features={result.features}
      truncated={result.truncated}
      suppressedCount={result.suppressedCount}
      allowedProvinces={allowedProvinces}
      localities={localities}
      localityCentroids={localityCentroids}
      kpisPromise={kpisPromise}
      initialBounds={initialBounds ?? undefined}
      initialLevel={initialLevel}
      initialDivisionProvince={initialDivisionProvince}
      initialDivisionLocality={initialDivisionLocality}
      defaultPresetId={defaultPresetId}
    />
  );
}
