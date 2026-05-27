// /gob/reglas — govt read-only view of the business rules that apply to them.
// Spec 2026-05-19-govt-business-rules-poc-design §6.4.
//
// Resolves each ruleType for the govt's assigned jurisdictions and shows
// where in the cascade the value came from (default vs country vs
// province vs locality). No edit buttons (BR6).

import Link from "next/link";

import { GOVT_BUSINESS_RULE_TYPES, type GovtBusinessRuleType } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { resolveBusinessRule } from "@/lib/business-rules-resolver";

export const dynamic = "force-dynamic";

const RULE_TYPE_LABEL: Record<GovtBusinessRuleType, string> = {
  ppp_breed_list: "Lista de razas PPP",
  ppp_weight_threshold: "Umbral de peso PPP",
  ppp_attestation_required_registries: "Registros de atestación requeridos",
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
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold text-gob-text">
            Reglas que aplican a tu jurisdicción
          </h1>
          <p className="text-sm text-gob-text-gray">
            Vista de solo lectura. La administración de reglas la hace el admin nacional desde{" "}
            <Link href="/admin/jurisdicciones" className="underline underline-offset-4">
              /admin/jurisdicciones
            </Link>
            .
          </p>
        </header>

        {groups.map((g, idx) => (
          <section
            key={`${g.scope.province ?? "country"}-${g.scope.locality ?? "all"}-${idx}`}
            className="rounded-2xl border border-gob-border overflow-hidden"
          >
            <div className="px-4 py-3 bg-gob-surface-alt border-b border-gob-border">
              <h2 className="text-sm font-semibold text-gob-text">
                AR · {g.scope.province ?? "(nivel país)"} ·{" "}
                {g.scope.locality ?? "(toda la provincia)"}
              </h2>
            </div>
            <ul className="divide-y divide-gob-border">
              {g.resolved.map(({ ruleType, payload, source }) => (
                <li key={ruleType} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-gob-text text-sm">{RULE_TYPE_LABEL[ruleType]}</p>
                    <span className="text-xs text-gob-text-muted">{SOURCE_LABEL[source]}</span>
                  </div>
                  <pre className="text-xs bg-gob-surface-alt rounded p-3 overflow-x-auto">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
