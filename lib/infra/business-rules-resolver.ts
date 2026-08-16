// Cascading resolver for govt business rules.
// Spec 2026-05-19-govt-business-rules-poc-design §4.3.
//
// Order: locality > province > country > hardcoded defaults.
// The first matching row wins; if none, the typed default from
// BUSINESS_RULES_DEFAULTS is returned.

import { and, eq, isNull } from "drizzle-orm";

import { type GovtBusinessRuleType, type RequirementLevel, db, govtBusinessRules } from "@/db";

import {
  BUSINESS_RULES_DEFAULTS,
  type BusinessRulePayload,
  type BusinessRulePayloadByType,
} from "@/lib/domain/business-rules-defaults";

export interface Jurisdiction {
  country?: string;
  province?: string | null;
  locality?: string | null;
}

/**
 * Information about which row (if any) supplied the resolved rule and
 * what jurisdiction level matched. Useful for the govt read-only
 * dashboard ("origen de la regla").
 */
export interface ResolvedRule<T extends GovtBusinessRuleType> {
  payload: BusinessRulePayload<T>;
  source: "default" | "country" | "province" | "locality";
  /**
   * Requirement tier + legal provenance (migration 0183) carried by the
   * matched row. All optional and ABSENT on the `default` path: when no row
   * matches anywhere in the cascade, nothing is claimed about the
   * jurisdiction's law — the tier is "not established", NEVER a hardcoded
   * `mandatory`. Consumers with a pre-tier boolean gate (microchip_required)
   * fall back to their payload semantics via
   * `microchipObligationApplies` (lib/domain/business-rules-defaults.ts).
   */
  requirementLevel?: RequirementLevel | null;
  legalBasis?: string | null;
  authority?: string | null;
  sourceUrl?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  baselineVersion?: string | null;
  matchedRow: {
    id: string;
    country: string;
    province: string | null;
    locality: string | null;
  } | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

/**
 * Find the most-specific business rule row for `ruleType` that applies
 * to `jurisdiction`. Falls back to the hardcoded default when nothing
 * matches.
 */
export async function resolveBusinessRule<T extends GovtBusinessRuleType>(
  ruleType: T,
  jurisdiction: Jurisdiction,
  executor: Executor = db,
): Promise<ResolvedRule<T>> {
  const country = jurisdiction.country ?? "AR";
  const province = jurisdiction.province ?? null;
  const locality = jurisdiction.locality ?? null;

  const candidates: {
    country: string;
    province: string | null;
    locality: string | null;
    source: ResolvedRule<T>["source"];
  }[] = [
    { country, province, locality, source: "locality" },
    { country, province, locality: null, source: "province" },
    { country, province: null, locality: null, source: "country" },
  ];

  for (const c of candidates) {
    // Skip the "locality" candidate when there's no locality input —
    // that lookup is identical to the "province" one.
    if (c.source === "locality" && locality === null) continue;
    if (c.source === "province" && province === null) continue;

    const [row] = await executor
      .select()
      .from(govtBusinessRules)
      .where(
        and(
          eq(govtBusinessRules.ruleType, ruleType),
          eq(govtBusinessRules.jurisdictionCountry, c.country),
          c.province === null
            ? isNull(govtBusinessRules.jurisdictionProvince)
            : eq(govtBusinessRules.jurisdictionProvince, c.province),
          c.locality === null
            ? isNull(govtBusinessRules.jurisdictionLocality)
            : eq(govtBusinessRules.jurisdictionLocality, c.locality),
        ),
      )
      .limit(1);
    if (row) {
      return {
        payload: row.rulePayload as BusinessRulePayload<T>,
        source: c.source,
        requirementLevel: row.requirementLevel,
        legalBasis: row.legalBasis,
        authority: row.authority,
        sourceUrl: row.sourceUrl,
        effectiveFrom: row.effectiveFrom,
        effectiveUntil: row.effectiveUntil,
        baselineVersion: row.baselineVersion,
        matchedRow: {
          id: row.id,
          country: row.jurisdictionCountry,
          province: row.jurisdictionProvince,
          locality: row.jurisdictionLocality,
        },
      };
    }
  }

  return {
    payload: BUSINESS_RULES_DEFAULTS[ruleType] as BusinessRulePayloadByType[T],
    source: "default",
    matchedRow: null,
  };
}

/**
 * Canonical string key for a jurisdiction — stable across `undefined`/`null`
 * normalization so batch-resolution maps can be looked up by re-deriving the
 * key from the same jurisdiction object.
 */
export function canonicalJurisdictionKey(jurisdiction: Jurisdiction): string {
  return [
    jurisdiction.country ?? "AR",
    jurisdiction.province ?? "",
    jurisdiction.locality ?? "",
  ].join("|");
}

/**
 * Batch variant (movilidad-jurisdiccional Fase 1, design D3): resolve ONE
 * rule type across N jurisdictions, keyed by canonicalJurisdictionKey.
 * Each jurisdiction goes through the same locality > province > country >
 * default cascade as resolveBusinessRule. Duplicate jurisdictions are
 * deduped — one cascade per distinct key.
 *
 * Sequential on purpose: `executor` may be a transaction, and drizzle tx
 * executors are not safe under concurrent queries.
 */
export async function resolveBusinessRuleForJurisdictions<T extends GovtBusinessRuleType>(
  ruleType: T,
  jurisdictions: Jurisdiction[],
  executor: Executor = db,
): Promise<Map<string, ResolvedRule<T>>> {
  const resolved = new Map<string, ResolvedRule<T>>();
  for (const jurisdiction of jurisdictions) {
    const key = canonicalJurisdictionKey(jurisdiction);
    if (resolved.has(key)) continue;
    resolved.set(key, await resolveBusinessRule(ruleType, jurisdiction, executor));
  }
  return resolved;
}
