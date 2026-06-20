"use server";

// Admin-only server actions for govt business rules.
// Spec 2026-05-19-govt-business-rules-poc-design §5.
//
// Three actions: create / update / delete. All gated by
// requireAdminOrRedirect (BR6). Each writes an audit_log row (BR7).
// Create detects no-op vs default (BR10).

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
  GOVT_BUSINESS_RULE_TYPES,
  type GovtBusinessRuleType,
  auditLog,
  db,
  govtBusinessRules,
} from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

import { BUSINESS_RULES_DEFAULTS } from "@/lib/business-rules-defaults";
import { reEvaluatePppBreedListChange } from "@/lib/business-rules-reeval";
import { validateRulePayload } from "@/lib/business-rules-validators";

export type BusinessRuleFormState = {
  error: string | null;
  warning?: string;
};

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeJurisdiction(formData: FormData): {
  country: string;
  province: string | null;
  locality: string | null;
} {
  const country = (formData.get("jurisdictionCountry") as string | null)?.trim() || "AR";
  const provinceRaw = (formData.get("jurisdictionProvince") as string | null)?.trim();
  const localityRaw = (formData.get("jurisdictionLocality") as string | null)?.trim();
  return {
    country,
    province: provinceRaw && provinceRaw !== "" ? provinceRaw : null,
    locality: localityRaw && localityRaw !== "" ? localityRaw : null,
  };
}

function parseLegalAnchorIds(formData: FormData): string[] {
  return (formData.getAll("legalAnchorIds") as string[])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Writer (testable, no auth)
// ---------------------------------------------------------------------------

export type CreateBusinessRuleWriterParams = {
  actorUserId: string;
  ruleType: GovtBusinessRuleType;
  jurisdictionCountry: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  rulePayload: unknown;
  notes: string | null;
  legalAnchorIds: string[];
};

export type CreateBusinessRuleResult =
  | { ok: true; ruleId: string; noOp?: false }
  | { ok: true; ruleId: null; noOp: true; reason: string }
  | { ok: false; error: string };

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

export type UpdateBusinessRuleWriterParams = {
  actorUserId: string;
  ruleId: string;
  rulePayload: unknown;
  notes: string | null;
  legalAnchorIds: string[];
};

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

export type DeleteBusinessRuleWriterParams = {
  actorUserId: string;
  ruleId: string;
};

export async function deleteBusinessRuleWriter(
  params: DeleteBusinessRuleWriterParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Capture the row scope BEFORE the tx so the post-commit reeval has
  // the jurisdiction even though the row is gone.
  let scope: { country: string; province: string | null; locality: string | null } | null = null;
  let ruleType: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(govtBusinessRules)
        .where(eq(govtBusinessRules.id, params.ruleId))
        .limit(1);
      if (!existing) throw new Error("Regla no encontrada");
      scope = {
        country: existing.jurisdictionCountry,
        province: existing.jurisdictionProvince,
        locality: existing.jurisdictionLocality,
      };
      ruleType = existing.ruleType;

      await tx.delete(govtBusinessRules).where(eq(govtBusinessRules.id, params.ruleId));

      await tx.insert(auditLog).values({
        actorUserId: params.actorUserId,
        action: "govt_business_rule_deleted",
        payload: {
          ruleId: params.ruleId,
          ruleType: existing.ruleType,
          jurisdiction: scope,
          previousPayload: existing.rulePayload,
        },
      });
    });
    if (ruleType === "ppp_breed_list" && scope) {
      await reEvaluatePppBreedListChange(scope);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
}

// ---------------------------------------------------------------------------
// Form-bound actions (admin-gated)
// ---------------------------------------------------------------------------

function parseRulePayloadFromForm(ruleType: GovtBusinessRuleType, formData: FormData): unknown {
  // Each rule type encodes its payload as form fields. Parsing logic lives
  // here so the action stays declarative — validators run after.
  switch (ruleType) {
    case "ppp_breed_list": {
      const breeds = (formData.getAll("breeds") as string[])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { breeds };
    }
    case "ppp_weight_threshold": {
      const kgRaw = (formData.get("kg") as string | null)?.trim();
      const kg = kgRaw && kgRaw !== "" ? Number.parseFloat(kgRaw) : null;
      const appliesIfBreedNotPPP = formData.get("appliesIfBreedNotPPP") === "on";
      return { kg, appliesIfBreedNotPPP };
    }
    case "ppp_attestation_required_registries": {
      // Each registry is encoded as registryId / registryLabel / registryRequired
      // arrays at the same index.
      const ids = formData.getAll("registryId") as string[];
      const labels = formData.getAll("registryLabel") as string[];
      const requiredFlags = formData.getAll("registryRequired") as string[];
      const registries = ids.map((id, i) => ({
        id: id.trim(),
        label: (labels[i] ?? "").trim(),
        required: requiredFlags[i] === "true" || requiredFlags[i] === "on",
      }));
      return { registries };
    }
    case "physical_credential_channels": {
      const printable_qr = formData.get("printable_qr") === "on";

      function parseProvider(channel: string) {
        const enabled = formData.get(`enabled_${channel}`) === "on";
        const providerNameRaw = (formData.get(`provider_name_${channel}`) as string | null)?.trim();
        const providerUrlRaw = (formData.get(`provider_url_${channel}`) as string | null)?.trim();
        return {
          enabled,
          ...(providerNameRaw ? { providerName: providerNameRaw } : {}),
          ...(providerUrlRaw ? { providerUrl: providerUrlRaw } : {}),
        };
      }

      return {
        printable_qr,
        engraved_plate: parseProvider("engraved_plate"),
        nfc_tag: parseProvider("nfc_tag"),
      };
    }
  }
}

export async function createBusinessRuleAction(
  _previous: BusinessRuleFormState,
  formData: FormData,
): Promise<BusinessRuleFormState> {
  const { user } = await requireAdminOrRedirect();

  const ruleTypeRaw = String(formData.get("ruleType") ?? "").trim();
  if (!(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleTypeRaw)) {
    return { error: "Rule type inválido" };
  }
  const ruleType = ruleTypeRaw as GovtBusinessRuleType;

  const { country, province, locality } = normalizeJurisdiction(formData);
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const legalAnchorIds = parseLegalAnchorIds(formData);

  const result = await createBusinessRuleWriter({
    actorUserId: user.id,
    ruleType,
    jurisdictionCountry: country,
    jurisdictionProvince: province,
    jurisdictionLocality: locality,
    rulePayload: parseRulePayloadFromForm(ruleType, formData),
    notes,
    legalAnchorIds,
  });
  if (!result.ok) return { error: result.error };
  if (result.noOp) {
    return { error: null, warning: result.reason };
  }
  redirect(
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`,
  );
}

export async function updateBusinessRuleAction(
  ruleId: string,
  _previous: BusinessRuleFormState,
  formData: FormData,
): Promise<BusinessRuleFormState> {
  const { user } = await requireAdminOrRedirect();

  const ruleTypeRaw = String(formData.get("ruleType") ?? "").trim();
  if (!(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleTypeRaw)) {
    return { error: "Rule type inválido" };
  }
  const ruleType = ruleTypeRaw as GovtBusinessRuleType;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const legalAnchorIds = parseLegalAnchorIds(formData);

  const result = await updateBusinessRuleWriter({
    actorUserId: user.id,
    ruleId,
    rulePayload: parseRulePayloadFromForm(ruleType, formData),
    notes,
    legalAnchorIds,
  });
  if (!result.ok) return { error: result.error };

  const { country, province, locality } = normalizeJurisdiction(formData);
  redirect(
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`,
  );
}

export async function deleteBusinessRuleAction(ruleId: string, formData: FormData): Promise<void> {
  const { user } = await requireAdminOrRedirect();
  const result = await deleteBusinessRuleWriter({ actorUserId: user.id, ruleId });
  if (!result.ok) throw new Error(result.error);
  const country = (formData.get("jurisdictionCountry") as string | null) ?? "AR";
  const province = (formData.get("jurisdictionProvince") as string | null) ?? "_";
  const locality = (formData.get("jurisdictionLocality") as string | null) ?? "_";
  redirect(
    `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province || "_")}/${encodeURIComponent(locality || "_")}/reglas`,
  );
}
