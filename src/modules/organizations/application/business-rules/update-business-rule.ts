import { eq } from "drizzle-orm";

import { auditLog, db, govtBusinessRules } from "@/db";
import { reEvaluatePppBreedListChange } from "@/lib/infra/business-rules-reeval";
import { validateRulePayload } from "@/lib/infra/business-rules-validators";

import type { UpdateBusinessRuleWriterParams } from "./types";

export async function updateBusinessRuleWriter(
  params: UpdateBusinessRuleWriterParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(govtBusinessRules)
        .where(eq(govtBusinessRules.id, params.ruleId))
        .limit(1);
      if (!existing) throw new Error("Regla no encontrada");

      const validation = validateRulePayload(existing.ruleType, params.rulePayload);
      if (!validation.ok) throw new Error(`Payload inválido: ${validation.error}`);

      await tx
        .update(govtBusinessRules)
        .set({
          rulePayload: validation.data,
          notes: params.notes,
          legalAnchorIds: params.legalAnchorIds.length > 0 ? params.legalAnchorIds : null,
          updatedByUserId: params.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(govtBusinessRules.id, params.ruleId));

      await tx.insert(auditLog).values({
        actorUserId: params.actorUserId,
        action: "govt_business_rule_updated",
        payload: {
          ruleId: params.ruleId,
          ruleType: existing.ruleType,
          jurisdiction: {
            country: existing.jurisdictionCountry,
            province: existing.jurisdictionProvince,
            locality: existing.jurisdictionLocality,
          },
          previousPayload: existing.rulePayload,
          newPayload: validation.data,
        },
      });
    });
    // Reeval after commit. Look up the row again to read jurisdiction
    // — we don't want to thread it through the closure.
    const [updated] = await db
      .select()
      .from(govtBusinessRules)
      .where(eq(govtBusinessRules.id, params.ruleId))
      .limit(1);
    if (updated?.ruleType === "ppp_breed_list") {
      await reEvaluatePppBreedListChange({
        country: updated.jurisdictionCountry,
        province: updated.jurisdictionProvince,
        locality: updated.jurisdictionLocality,
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
}
