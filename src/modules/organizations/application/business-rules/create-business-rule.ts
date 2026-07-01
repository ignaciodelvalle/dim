import { and, eq, isNull } from "drizzle-orm";

import { GOVT_BUSINESS_RULE_TYPES, auditLog, db, govtBusinessRules } from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/business-rules-defaults";
import { reEvaluatePppBreedListChange } from "@/lib/business-rules-reeval";
import { validateRulePayload } from "@/lib/business-rules-validators";

import type { CreateBusinessRuleResult, CreateBusinessRuleWriterParams } from "./types";

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function createBusinessRuleWriter(
  params: CreateBusinessRuleWriterParams,
): Promise<CreateBusinessRuleResult> {
  if (!(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(params.ruleType)) {
    return { ok: false, error: "Rule type inválido" };
  }
  const validation = validateRulePayload(params.ruleType, params.rulePayload);
  if (!validation.ok) {
    return { ok: false, error: `Payload inválido: ${validation.error}` };
  }

  // No-op detection: if the proposed payload matches the hardcoded
  // default, refuse to insert — the resolver would return the same
  // value anyway and the row would just add noise.
  const defaultPayload = BUSINESS_RULES_DEFAULTS[params.ruleType];
  if (deepEqual(validation.data, defaultPayload)) {
    return {
      ok: true,
      ruleId: null,
      noOp: true,
      reason: "Esta configuración es idéntica al default — no se requiere override.",
    };
  }

  try {
    const ruleId = await db.transaction(async (tx) => {
      // Duplicate detection: existing row for the same (jurisdiction +
      // rule_type) should UPDATE not INSERT. The dedicated `update`
      // action handles that explicitly; here we reject so the admin
      // knows to go through update.
      const [existing] = await tx
        .select({ id: govtBusinessRules.id })
        .from(govtBusinessRules)
        .where(
          and(
            eq(govtBusinessRules.ruleType, params.ruleType),
            eq(govtBusinessRules.jurisdictionCountry, params.jurisdictionCountry),
            params.jurisdictionProvince === null
              ? isNull(govtBusinessRules.jurisdictionProvince)
              : eq(govtBusinessRules.jurisdictionProvince, params.jurisdictionProvince),
            params.jurisdictionLocality === null
              ? isNull(govtBusinessRules.jurisdictionLocality)
              : eq(govtBusinessRules.jurisdictionLocality, params.jurisdictionLocality),
          ),
        )
        .limit(1);
      if (existing) {
        throw new Error(
          "Ya existe una regla para esa combinación de jurisdicción y tipo. Usá editar.",
        );
      }

      const [created] = await tx
        .insert(govtBusinessRules)
        .values({
          jurisdictionCountry: params.jurisdictionCountry,
          jurisdictionProvince: params.jurisdictionProvince,
          jurisdictionLocality: params.jurisdictionLocality,
          ruleType: params.ruleType,
          rulePayload: validation.data,
          notes: params.notes,
          legalAnchorIds: params.legalAnchorIds.length > 0 ? params.legalAnchorIds : null,
          createdByUserId: params.actorUserId,
          updatedByUserId: params.actorUserId,
        })
        .returning({ id: govtBusinessRules.id });

      await tx.insert(auditLog).values({
        actorUserId: params.actorUserId,
        action: "govt_business_rule_created",
        payload: {
          ruleId: created.id,
          ruleType: params.ruleType,
          jurisdiction: {
            country: params.jurisdictionCountry,
            province: params.jurisdictionProvince,
            locality: params.jurisdictionLocality,
          },
          newPayload: validation.data,
        },
      });

      return created.id;
    });

    // Trigger re-evaluation outside the tx so the tx-bound auditLog row
    // commits even if the reeval errors. PPP is the only ruleType that
    // affects pet-level state today; future types add their own hook.
    if (params.ruleType === "ppp_breed_list") {
      await reEvaluatePppBreedListChange({
        country: params.jurisdictionCountry,
        province: params.jurisdictionProvince,
        locality: params.jurisdictionLocality,
      });
    }

    return { ok: true, ruleId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
}
