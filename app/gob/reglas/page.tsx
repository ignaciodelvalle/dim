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
import { GOVT_BUSINESS_RULE_TYPES } from "@/db";
import {
  RULE_TYPE_REGISTRY,
  RULE_SOURCE_LABEL as SOURCE_LABEL,
  summarizeRulePayload,
} from "@/lib/domain/rule-types-registry";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { portalBase } from "@/lib/ui/portal-base";

import { AdminReglasLens } from "./AdminReglasLens";

export const dynamic = "force-dynamic";

export default async function ReglasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { jurisdictions, profile } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

  if (profile.role === "admin") {
    // Search (opfilterbar-sweep2-2026-07-21 item 3) only applies to the admin
    // lens: it's the jurisdiction browser (24 provincias + their localities),
    // the screen that actually grows unwieldy to scan. The govt read-only
    // cascade view below is pre-scoped to the viewer's own few assigned
    // localities — always a short, already-filtered list — so a search
    // control there would filter almost nothing.
    const { q } = await searchParams;
    return <AdminReglasLens base={base} query={(q ?? "").trim()} />;
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

  const groups = await Promise.all(
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
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          miMAR Gobierno · Reglas
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Reglas que aplican a tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Vista de solo lectura, pre-filtrada a tus localidades asignadas. La administración de
          reglas la hace el admin nacional.
        </p>
      </header>

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
                    <p className="text-[13px] font-medium text-ln-op-ink">
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
                    <p className="text-[12.5px] text-ln-op-ink-2">
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
