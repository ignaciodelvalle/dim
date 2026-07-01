// /admin/jurisdicciones — list of provinces with rule counts.
// Spec 2026-05-19-govt-business-rules-poc-design §6.1.
//
// Province-wide rules (locality IS NULL) and locality overrides are counted
// separately so the numbers reconcile with the per-jurisdiction rules page.
// Localities that have at least one rule are surfaced as direct links.

import { isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { db, govtBusinessRules } from "@/db";
import { buildJurisdictionRulesHref } from "@/lib/domain/jurisdiction-rules-href";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { PROVINCES } from "@/lib/reference/ar-provincias";

import { LocalityRuleDrilldown } from "./LocalityRuleDrilldown";

export const dynamic = "force-dynamic";

export default async function AdminJurisdiccionesPage() {
  await requireAdminOrRedirect();

  // Separate query for province-wide rules (locality IS NULL).
  const provinceWideRows = await db
    .select({
      country: govtBusinessRules.jurisdictionCountry,
      province: govtBusinessRules.jurisdictionProvince,
      count: sql<number>`count(*)::int`,
    })
    .from(govtBusinessRules)
    .where(isNull(govtBusinessRules.jurisdictionLocality))
    .groupBy(govtBusinessRules.jurisdictionCountry, govtBusinessRules.jurisdictionProvince);

  // Separate query for locality-level rules (locality IS NOT NULL).
  const localityRows = await db
    .select({
      country: govtBusinessRules.jurisdictionCountry,
      province: govtBusinessRules.jurisdictionProvince,
      locality: govtBusinessRules.jurisdictionLocality,
      count: sql<number>`count(*)::int`,
    })
    .from(govtBusinessRules)
    .where(sql`${govtBusinessRules.jurisdictionLocality} IS NOT NULL`)
    .groupBy(
      govtBusinessRules.jurisdictionCountry,
      govtBusinessRules.jurisdictionProvince,
      govtBusinessRules.jurisdictionLocality,
    );

  // Province-wide counts (locality IS NULL, province IS NOT NULL).
  const provinceWideCount = new Map<string, number>();
  let countryWideCount = 0;
  for (const r of provinceWideRows) {
    if (r.province === null) {
      countryWideCount += r.count;
    } else {
      provinceWideCount.set(r.province, r.count);
    }
  }

  // Locality-level counts grouped by province.
  type LocalityEntry = { locality: string; count: number };
  const localitiesByProvince = new Map<string, LocalityEntry[]>();
  for (const r of localityRows) {
    if (r.province === null || r.locality === null) continue;
    const existing = localitiesByProvince.get(r.province) ?? [];
    existing.push({ locality: r.locality, count: r.count });
    localitiesByProvince.set(r.province, existing);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Jurisdicciones
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Jurisdicciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Configura reglas de negocio scope-aware por país, provincia o localidad. Sin overrides
          {" -> "}se usan los defaults nacionales.
        </p>
      </header>

      {/* Country-level */}
      <OpCard>
        <OpCardHead
          title="AR (país)"
          actions={
            <span className="text-sm text-ln-op-mute">
              {countryWideCount} regla{countryWideCount === 1 ? "" : "s"}
            </span>
          }
        />
        <OpCardBody className="p-0">
          <ul>
            <li className="flex items-center justify-between border-t border-ln-op-line px-4 py-3">
              <span className="text-[13px] text-ln-op-ink-2">Reglas a nivel país AR</span>
              <Link
                href={buildJurisdictionRulesHref({ country: "AR" })}
                className="text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
              >
                {"Ver reglas ->"}
              </Link>
            </li>
          </ul>
        </OpCardBody>
      </OpCard>

      {/* Provinces */}
      <OpCard>
        <OpCardHead title="Provincias" />
        <OpCardBody className="p-0">
          <ul>
            {PROVINCES.map((p) => {
              const pwCount = provinceWideCount.get(p.name) ?? 0;
              const localities = localitiesByProvince.get(p.name) ?? [];
              const localityRuleCount = localities.reduce((sum, l) => sum + l.count, 0);
              return (
                <li key={p.code} className="border-t border-ln-op-line px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium text-ln-op-ink">{p.name}</p>
                      <p className="text-[11px] text-ln-op-mute">
                        {pwCount === 0 && localityRuleCount === 0
                          ? "Sin overrides (usando defaults)"
                          : [
                              pwCount > 0
                                ? `${pwCount} provincial${pwCount === 1 ? "" : "es"}`
                                : null,
                              localityRuleCount > 0 ? `${localityRuleCount} en localidades` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={buildJurisdictionRulesHref({ country: "AR", province: p.name })}
                      className="shrink-0 text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                    >
                      {pwCount === 0 ? "Crear regla ->" : "Ver reglas ->"}
                    </Link>
                  </div>
                  {/* Localities with overrides — surfaced as direct links */}
                  {localities.length > 0 && (
                    <ul className="pl-4 space-y-1">
                      {localities.map((l) => (
                        <li key={l.locality} className="flex items-center justify-between gap-3">
                          <span className="text-[11px] text-ln-op-ink-2">
                            {l.locality}
                            <span className="ml-1 text-ln-op-mute">
                              · {l.count} regla{l.count === 1 ? "" : "s"}
                            </span>
                          </span>
                          <Link
                            href={buildJurisdictionRulesHref({
                              country: "AR",
                              province: p.name,
                              locality: l.locality,
                            })}
                            className="text-[11px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
                          >
                            {"Ver ->"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* AC4 — reach ANY locality (not just ones with existing
                      rules) so a fresh locality override can be created. */}
                  <LocalityRuleDrilldown provinceCode={p.code} provinceName={p.name} />
                </li>
              );
            })}
          </ul>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
