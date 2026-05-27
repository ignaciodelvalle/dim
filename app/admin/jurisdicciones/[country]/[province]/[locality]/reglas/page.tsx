// /admin/jurisdicciones/[country]/[province]/[locality]/reglas — list +
// create entry points for the rule types of a specific jurisdiction.
// Spec 2026-05-19-govt-business-rules-poc-design §6.2.
//
// Route params: '_' is the sentinel for "null". So
// /admin/jurisdicciones/AR/_/_/reglas → country-level rules for AR.

import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import {
  GOVT_BUSINESS_RULE_TYPES,
  type GovtBusinessRuleType,
  db,
  govtBusinessRules,
  profiles,
} from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/business-rules-defaults";
import { formatDate } from "@/lib/format";

import { DeleteRuleButton } from "./DeleteRuleButton";

export const dynamic = "force-dynamic";

const RULE_TYPE_LABEL: Record<GovtBusinessRuleType, string> = {
  ppp_breed_list: "Lista de razas PPP",
  ppp_weight_threshold: "Umbral de peso PPP",
  ppp_attestation_required_registries: "Registros de atestación requeridos",
};

const RULE_TYPE_DESCRIPTION: Record<GovtBusinessRuleType, string> = {
  ppp_breed_list: "Qué razas se consideran Potencialmente Peligrosas en esta jurisdicción.",
  ppp_weight_threshold: "Si el peso del animal por sí solo dispara el status PPP, y a qué kilos.",
  ppp_attestation_required_registries:
    "En qué registros oficiales el dueño debe atestar a su mascota PPP.",
};

function decodeNullable(raw: string): string | null {
  if (raw === "_") return null;
  return decodeURIComponent(raw);
}

function jurisdictionLabel(country: string, province: string | null, locality: string | null) {
  const parts = [country, province ?? "(nivel país)", locality ?? "(toda la provincia)"];
  return parts.join(" · ");
}

export default async function AdminJurisdiccionReglasPage({
  params,
}: {
  params: Promise<{ country: string; province: string; locality: string }>;
}) {
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
  const missingTypes = GOVT_BUSINESS_RULE_TYPES.filter((t) => !activeByType.has(t));

  const segCountry = encodeURIComponent(country);
  const segProvince = encodeURIComponent(province ?? "_");
  const segLocality = encodeURIComponent(locality ?? "_");

  return (
    <main className="px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <Link
            href="/admin/jurisdicciones"
            className="text-sm text-neutral-500 hover:text-gob-text"
          >
            ← Jurisdicciones
          </Link>
          <h1 className="text-2xl font-semibold text-gob-text">
            Reglas para {jurisdictionLabel(country, province, locality)}
          </h1>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">
            Reglas activas
          </h2>
          {rows.length === 0 && (
            <p className="text-sm text-gob-text-muted">
              Esta jurisdicción no tiene overrides. Toda regla cae a la cascada superior.
            </p>
          )}
          {rows.map(({ rule, updatedBy }) => (
            <article key={rule.id} className="rounded-xl border border-gob-border p-4 space-y-2">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gob-text">
                    {RULE_TYPE_LABEL[rule.ruleType as GovtBusinessRuleType]}
                  </p>
                  <p className="text-xs text-gob-text-muted">
                    Actualizado {formatDate(rule.updatedAt)} · {updatedBy ?? "Sistema"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/jurisdicciones/${segCountry}/${segProvince}/${segLocality}/reglas/editar/${rule.id}`}
                    className="text-sm text-gob-text-gray underline underline-offset-4"
                  >
                    Editar
                  </Link>
                  <DeleteRuleButton
                    ruleId={rule.id}
                    country={country}
                    province={province}
                    locality={locality}
                  />
                </div>
              </header>
              <pre className="text-xs bg-gob-surface-alt rounded p-3 overflow-x-auto">
                {JSON.stringify(rule.rulePayload, null, 2)}
              </pre>
              {rule.notes && <p className="text-xs text-gob-text-gray">{rule.notes}</p>}
            </article>
          ))}
        </section>

        {missingTypes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">
              Tipos sin override (usando defaults)
            </h2>
            <ul className="space-y-2">
              {missingTypes.map((t) => (
                <li
                  key={t}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gob-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gob-text">{RULE_TYPE_LABEL[t]}</p>
                    <p className="text-xs text-gob-text-muted">{RULE_TYPE_DESCRIPTION[t]}</p>
                    <p className="text-xs text-gob-text-muted mt-1">
                      Default: {JSON.stringify(BUSINESS_RULES_DEFAULTS[t]).slice(0, 120)}…
                    </p>
                  </div>
                  <Link
                    href={`/admin/jurisdicciones/${segCountry}/${segProvince}/${segLocality}/reglas/nueva?ruleType=${t}`}
                    className="text-sm text-gob-text underline underline-offset-4"
                  >
                    Configurar →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
