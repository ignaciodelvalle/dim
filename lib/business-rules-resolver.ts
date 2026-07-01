// Cascading resolver for govt business rules.
// Spec 2026-05-19-govt-business-rules-poc-design §4.3.
//
// Order: locality > province > country > hardcoded defaults.
// The first matching row wins; if none, the typed default from
// BUSINESS_RULES_DEFAULTS is returned.

import { and, eq, isNull } from "drizzle-orm";

import { type GovtBusinessRuleType, db, govtBusinessRules } from "@/db";

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
