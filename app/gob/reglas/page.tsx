// /gob/reglas — THE single rules console (design ADR-1). Server-side
// capability branch on profile.role:
//   - admin lens: inline CRUD at universal scope + jurisdiction picker
//     (folded in verbatim from the old /admin/jurisdicciones surface).
//   - govt lens: read-only resolved-cascade view, pre-scoped to the user's
//     own institutional assignments (unchanged behavior, BR6 preserved).
//
// Mirrors app/gob/servicios/page.tsx — one page, two presentational lenses,
// not parallel routes (AC3 pattern).

import { OpCard, OpCardBody, OpCardHead, OpCodeBadge } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { GOVT_BUSINESS_RULE_TYPES } from "@/db";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import {
  RULE_TYPE_REGISTRY,
  RULE_SOURCE_LABEL as SOURCE_LABEL,
  summarizeRulePayload,
} from "@/lib/domain/rule-types-registry";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { portalBase } from "@/lib/ui/portal-base";
import { trimmedSearchParam } from "@/lib/utils/search-params";

import { AdminReglasLens } from "./AdminReglasLens";

export const dynamic = "force-dynamic";

export default async function ReglasPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { jurisdictions, profile } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

  if (profile.role === "admin") {
    // Rule-kind filter (PO redesign 2026-07-23) only applies to the admin
    // lens — it's now a short list of ONLY the jurisdictions that have custom
    // rules, so a "which jurisdictions touched this rule kind?" dropdown is
    // useful. The govt read-only cascade view below is pre-scoped to the
    // viewer's own few assigned localities — always a short, already-filtered
    // list — so a filter there would narrow almost nothing.
    const { kind } = await searchParams;
    // Q1: a repeated ?kind= hands Next a string[] — raw `.trim()` on that
    // throws (500).
    return <AdminReglasLens base={base} kind={trimmedSearchParam(kind) ?? ""} />;
  }

  return <GovtReglasReadOnlyView jurisdictions={jurisdictions} />;
}

async function GovtReglasReadOnlyView({
  jurisdictions,
}: {
  jurisdictions: { province: string | null; locality: string | null }[];
}) {
  const scopes =
    jurisdictions.length === 0
      ? [{ province: null as string | null, locality: null as string | null }]
      : jurisdictions;

  // BOUNDED. This is the heaviest fan-out in the portal and it was awaited
  // bare: `scopes × GOVT_BUSINESS_RULE_TYPES` (10) resolutions, and each
  // resolveBusinessRule walks up to three candidates — locality → province →
  // country — in a loop that is SEQUENTIAL on purpose (its executor may be a
  // transaction). One assigned jurisdiction is therefore up to 30 sequential
  // round-trips before a single pixel paints; five localities, up to 150.
  //
  // The N+1 itself is filed separately — the country-level lookup for a given
  // rule type is identical across every scope and re-runs in full each time,
  // and the fix is to read the jurisdictions' rules in ONE query and cascade in
  // memory. The resolver cannot simply be wrapped in cache(): it accepts an
  // optional transaction executor, and memoising a tx-bound call would be a
  // worse bug than the one being fixed. This deadline is the part that stops
  // the page hanging today.
  const load = await loadWithTimeout(
    Promise.all(
      scopes.map(async (scope) => {
        const resolved = await Promise.all(
          GOVT_BUSINESS_RULE_TYPES.map(async (ruleType) => {
            const r = await resolveBusinessRule(ruleType, {
              country: "AR",
              province: scope.province ?? undefined,
              locality: scope.locality ?? undefined,
            });
            return { ruleType, ...r };
          }),
        );
        return { scope, resolved };
      }),
    ),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6 max-w-3xl">
        <AnalyticsLoadFallback reason={load.reason} retryHref={analyticsRetryHref("/gob/reglas")} />
      </div>
    );
  }
  const groups = load.value;

  return (
    <div className="space-y-6 max-w-3xl">
      <ScreenHeader
        eyebrow="miMAR Gobierno · Reglas"
        title="Reglas que aplican a tu jurisdicción"
        subtitle={
          <p className="text-md text-ln-op-ink-2">
            Vista de solo lectura, pre-filtrada a tus localidades asignadas. La administración de
            reglas la hace el admin nacional.
          </p>
        }
      />

      {groups.map((g, idx) => (
        <OpCard key={`${g.scope.province ?? "country"}-${g.scope.locality ?? "all"}-${idx}`}>
          <OpCardHead
            title={
              g.scope.province == null
                ? "AR · (nivel país)"
                : g.scope.locality == null
                  ? `AR · ${g.scope.province}`
                  : `AR · ${g.scope.province} · ${g.scope.locality}`
            }
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {g.resolved.map(({ ruleType, payload, source }) => (
                <li key={ruleType} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-md font-medium text-ln-op-ink">
                      {RULE_TYPE_REGISTRY[ruleType].label}
                    </p>
                    <span className="text-sm text-ln-op-mute">{SOURCE_LABEL[source]}</span>
                  </div>
                  {ruleType === "ppp_breed_list" &&
                  payload != null &&
                  typeof payload === "object" &&
                  "breeds" in payload &&
                  Array.isArray((payload as { breeds: unknown }).breeds) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(payload as { breeds: string[] }).breeds.map((breed) => (
                        <OpCodeBadge key={breed} tone="neutral">
                          {breed}
                        </OpCodeBadge>
                      ))}
                    </div>
                  ) : (
                    // es-AR summary instead of raw JSON — operators read the
                    // console, they don't parse payloads (QA round 2 #7).
                    <p className="text-md text-ln-op-ink-2">
                      {summarizeRulePayload(ruleType, payload)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      ))}
    </div>
  );
}
