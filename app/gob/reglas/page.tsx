// /gob/reglas — govt read-only view of the business rules that apply to them.
// Spec 2026-05-19-govt-business-rules-poc-design §6.4.
//
// Resolves each ruleType for the govt's assigned jurisdictions and shows
// where in the cascade the value came from (default vs country vs
// province vs locality). No edit buttons (BR6).

import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpCodeBadge } from "@/components/ui/dashboard";
import { GOVT_BUSINESS_RULE_TYPES, type GovtBusinessRuleType } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { resolveBusinessRule } from "@/lib/business-rules-resolver";

export const dynamic = "force-dynamic";

const RULE_TYPE_LABEL: Record<GovtBusinessRuleType, string> = {
  ppp_breed_list: "Lista de razas PPP",
  ppp_weight_threshold: "Umbral de peso PPP",
  ppp_attestation_required_registries: "Registros de atestación requeridos",
  physical_credential_channels: "Canales de credencial física",
};

const SOURCE_LABEL: Record<string, string> = {
  default: "Default nacional",
  country: "Override país (AR)",
  province: "Override provincia",
  locality: "Override localidad",
};

export default async function GobReglasPage() {
  const { jurisdictions, profile } = await requireAdminOrGovtOrRedirect();

  // Admin reads every rule across the country; govt reads only its assigned
  // jurisdictions. For simplicity we group rule reads by jurisdiction here.
  const scopes =
    profile.role === "admin"
      ? [{ province: null as string | null, locality: null as string | null }]
      : jurisdictions.length === 0
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
          MiMAR Gobierno · Reglas
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Reglas que aplican a tu jurisdicción
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Vista de solo lectura. La administración de reglas la hace el admin nacional desde{" "}
          <Link
            href="/admin/jurisdicciones"
            className="underline underline-offset-4 text-ln-op-azul"
          >
            /admin/jurisdicciones
          </Link>
          .
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
                      {RULE_TYPE_LABEL[ruleType]}
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
                    <pre className="text-[11px] bg-ln-op-stripe rounded-[4px] p-3 overflow-x-auto text-ln-op-ink-2 font-mono">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
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
