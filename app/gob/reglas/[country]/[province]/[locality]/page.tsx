// /gob/reglas/[country]/[province]/[locality] — list + create entry points
// for the rule types of a specific jurisdiction (admin lens, design ADR-1).
// Spec 2026-05-19-govt-business-rules-poc-design §6.2.
//
// Route params: '_' is the sentinel for "null". So
// /gob/reglas/AR/_/_ -> country-level rules for AR.

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpCrumbs } from "@/components/ui/dashboard";
import {
  GOVT_BUSINESS_RULE_TYPES,
  type GovtBusinessRuleType,
  db,
  govtBusinessRules,
  profiles,
} from "@/db";
import { RULE_TYPE_REGISTRY, summarizeRulePayload } from "@/lib/domain/rule-types-registry";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { portalBase } from "@/lib/ui/portal-base";
import { formatDate } from "@/lib/utils/format";

import { DeleteRuleButton } from "./DeleteRuleButton";
import { RULE_FORM_REGISTRY } from "./nueva/forms";

export const dynamic = "force-dynamic";

function decodeNullable(raw: string): string | null {
  if (raw === "_") return null;
  return decodeURIComponent(raw);
}

function jurisdictionLabel(country: string, province: string | null, locality: string | null) {
  const parts = [country, province ?? "(nivel país)", locality ?? "(toda la provincia)"];
  return parts.join(" · ");
}

export default async function JurisdictionReglasPage({
  params,
}: {
  params: Promise<{ country: string; province: string; locality: string }>;
}) {
  await requireAdminOrRedirect();
  const base = await portalBase();

  const { country: countryRaw, province: provinceRaw, locality: localityRaw } = await params;
  const country = decodeURIComponent(countryRaw);
  const province = decodeNullable(provinceRaw);
  const locality = decodeNullable(localityRaw);

  const rows = await db
    .select({
      rule: govtBusinessRules,
      updatedBy: profiles.displayName,
    })
    .from(govtBusinessRules)
    .leftJoin(profiles, eq(profiles.id, govtBusinessRules.updatedByUserId))
    .where(
      and(
        eq(govtBusinessRules.jurisdictionCountry, country),
        province === null
          ? isNull(govtBusinessRules.jurisdictionProvince)
          : eq(govtBusinessRules.jurisdictionProvince, province),
        locality === null
          ? isNull(govtBusinessRules.jurisdictionLocality)
          : eq(govtBusinessRules.jurisdictionLocality, locality),
      ),
    );

  const activeByType = new Map(rows.map((r) => [r.rule.ruleType, r]));
  // Exclude rule types that don't have a configuration form yet — no dead-end links.
  const missingTypes = GOVT_BUSINESS_RULE_TYPES.filter(
    (t) => !activeByType.has(t) && t in RULE_FORM_REGISTRY,
  );

  const segCountry = encodeURIComponent(country);
  const segProvince = encodeURIComponent(province ?? "_");
  const segLocality = encodeURIComponent(locality ?? "_");

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <OpCrumbs
        items={[
          { label: "Reglas", href: `${base}/reglas` },
          { label: jurisdictionLabel(country, province, locality) },
        ]}
      />

      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Reglas para {jurisdictionLabel(country, province, locality)}
        </h1>
      </header>

      {/* Active rules */}
      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Reglas activas
        </p>
        {rows.length === 0 && (
          <p className="text-[13px] text-ln-op-mute">
            Esta jurisdicción no tiene overrides. Toda regla cae a la cascada superior.
          </p>
        )}
        {rows.map(({ rule, updatedBy }) => (
          <OpCard key={rule.id}>
            <OpCardHead
              title={RULE_TYPE_REGISTRY[rule.ruleType as GovtBusinessRuleType].label}
              actions={
                <div className="flex gap-3">
                  <Link
                    href={`${base}/reglas/${segCountry}/${segProvince}/${segLocality}/editar/${rule.id}`}
                    className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                  >
                    Editar
                  </Link>
                  <DeleteRuleButton
                    ruleId={rule.id}
                    country={country}
                    province={province}
                    locality={locality}
                    base={base}
                  />
                </div>
              }
            />
            <OpCardBody>
              <p className="text-[11px] text-ln-op-mute mb-2">
                Actualizado {formatDate(rule.updatedAt)} {"·"} {updatedBy ?? "Sistema"}
              </p>
              <pre className="text-[11px] bg-ln-op-stripe rounded-[var(--radius-sm)] p-3 overflow-x-auto text-ln-op-ink-2">
                {JSON.stringify(rule.rulePayload, null, 2)}
              </pre>
              {rule.notes && <p className="text-sm text-ln-op-ink-2 mt-2">{rule.notes}</p>}
            </OpCardBody>
          </OpCard>
        ))}
      </section>

      {/* Missing types */}
      {missingTypes.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Tipos sin override (usando defaults)
          </p>
          <ul className="space-y-2">
            {missingTypes.map((t) => (
              <li key={t}>
                <OpCard>
                  <OpCardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ln-op-ink">
                          {RULE_TYPE_REGISTRY[t].label}
                        </p>
                        <p className="text-[11px] text-ln-op-mute">
                          {RULE_TYPE_REGISTRY[t].description}
                        </p>
                        <p className="text-[11px] text-ln-op-mute mt-1">
                          Default: {summarizeRulePayload(t, RULE_TYPE_REGISTRY[t].default)}
                        </p>
                      </div>
                      <Link
                        href={`${base}/reglas/${segCountry}/${segProvince}/${segLocality}/nueva?ruleType=${t}`}
                        className="shrink-0 text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                      >
                        {"Configurar ->"}
                      </Link>
                    </div>
                  </OpCardBody>
                </OpCard>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
