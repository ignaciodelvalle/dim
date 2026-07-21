// AdminReglasLens — the admin capability lens of the unified /gob/reglas
// surface (design ADR-1). Folded in verbatim from the old /admin/jurisdicciones
// index page; only the rules-href target moved (buildJurisdictionRulesHref now
// points at /gob/reglas/... instead of /admin/jurisdicciones/.../reglas).
//
// Province-wide rules (locality IS NULL) and locality overrides are counted
// separately so the numbers reconcile with the per-jurisdiction rules page.
// Localities that have at least one rule are surfaced as direct links.

import { isNull, sql } from "drizzle-orm";
import Link from "next/link";

import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpFilterBar,
  SearchFilterField,
} from "@/components/ui/dashboard";
import { db, govtBusinessRules } from "@/db";
import { buildJurisdictionRulesHref } from "@/lib/domain/jurisdiction-rules-href";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { pluralizeEs } from "@/lib/utils/format";
import { normalizeText } from "@/lib/utils/text-normalize";

import { LocalityRuleDrilldown } from "./LocalityRuleDrilldown";

type Props = {
  /**
   * Portal prefix the drill-down links must stay inside (portal-follows-viewer,
   * 2026-07-02) — this lens renders under both /admin/reglas and /gob/reglas.
   */
  base: "/admin" | "/gob";
  /**
   * Free-text filter over jurisdiction (provincia/localidad) names
   * (opfilterbar-sweep2-2026-07-21 item 3). Empty/undefined = show all.
   *
   * Why jurisdiction, not rule name/type: this screen is the index of the
   * rules console, not a flat rules table — each provincia row shows an
   * AGGREGATE COUNT per rule type, not individually named rule rows (those
   * only exist one jurisdiction at a time, on the [country]/[province]/
   * [locality] drill-down, capped at the ~9 GOVT_BUSINESS_RULE_TYPES — too
   * short a list to benefit from search). The field an admin actually wants
   * to search by HERE, scanning 24 provincias plus their localities, is the
   * jurisdiction name itself, to jump straight to e.g. "Córdoba" or "San
   * Isidro" instead of scrolling.
   */
  query?: string;
};

export async function AdminReglasLens({ base, query = "" }: Props) {
  // Defense in depth (R1.9): the parent page already branches on
  // profile.role === "admin", but this component re-asserts the stricter
  // admin-only guard independently.
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

  // Search (item 3, see the `query` prop doc above) — accent/case-insensitive
  // substring match, same normalizeText helper the admins/govts roster fix
  // uses. A province is kept if ITS OWN name matches, or if any locality
  // under it (one that already has a rule override) matches — so searching
  // "san isidro" surfaces the Buenos Aires card, not a dead end.
  const normalizedQuery = normalizeText(query);
  const visibleProvinces = normalizedQuery
    ? PROVINCES.filter((p) => {
        if (normalizeText(p.name).includes(normalizedQuery)) return true;
        const localities = localitiesByProvince.get(p.name) ?? [];
        return localities.some((l) => normalizeText(l.locality).includes(normalizedQuery));
      })
    : PROVINCES;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Jurisdicciones
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Jurisdicciones</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Configurá reglas según la jurisdicción — país, provincia o localidad. Sin excepciones
          {" → "}se usan los valores nacionales por defecto.
        </p>
      </header>

      {/* Unified filter bar (opfilterbar-sweep2-2026-07-21 item 3) — this
          screen had no filter at all. No period/jurisdiction axis (this IS
          the jurisdiction browser), so just the free-text search child. */}
      <OpFilterBar showPeriod={false}>
        <SearchFilterField
          paramKey="q"
          value={query}
          label="Buscar"
          placeholder="Buscar provincia o localidad"
        />
      </OpFilterBar>

      {/* Country-level */}
      <OpCard>
        <OpCardHead
          title="AR (país)"
          actions={
            <span className="text-sm text-ln-op-mute">
              {countryWideCount} {pluralizeEs(countryWideCount, "regla")}
            </span>
          }
        />
        <OpCardBody className="p-0">
          <ul>
            <li className="flex items-center justify-between border-t border-ln-op-line px-4 py-3">
              <span className="text-[13px] text-ln-op-ink-2">Reglas a nivel país AR</span>
              <Link
                href={buildJurisdictionRulesHref({ country: "AR", base })}
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
          {visibleProvinces.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-ln-op-mute">Sin resultados.</p>
          )}
          <ul>
            {visibleProvinces.map((p) => {
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
                          ? "Sin excepciones (usando valores por defecto)"
                          : [
                              pwCount > 0
                                ? `${pwCount} ${pluralizeEs(pwCount, "provincial")}`
                                : null,
                              localityRuleCount > 0 ? `${localityRuleCount} en localidades` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={buildJurisdictionRulesHref({ country: "AR", province: p.name, base })}
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
                              · {l.count} {pluralizeEs(l.count, "regla")}
                            </span>
                          </span>
                          <Link
                            href={buildJurisdictionRulesHref({
                              country: "AR",
                              province: p.name,
                              locality: l.locality,
                              base,
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
                  <LocalityRuleDrilldown provinceCode={p.code} provinceName={p.name} base={base} />
                </li>
              );
            })}
          </ul>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
